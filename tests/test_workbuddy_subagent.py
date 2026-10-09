import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stderr
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "skills/workbuddy-subagent/scripts/workbuddy.py"
spec = importlib.util.spec_from_file_location("workbuddy", SCRIPT)
wb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wb)


class WorkBuddyTests(unittest.TestCase):
    def test_relative_runtime_paths_stay_bound_when_child_cwd_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            app = root / 'app'
            (app / 'Contents').mkdir(parents=True)
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleExecutable': 'WorkBuddy'}))
            (root / 'cli').write_text('fake CLI')
            data = root / 'data'
            (data / 'cache').mkdir(parents=True)
            product = data / 'cache/acc-product-config-v3.json'
            product.write_text('{}')
            home = root / 'home'
            (home / '.workbuddy-subagent').mkdir(parents=True)
            (home / '.workbuddy-subagent/config.json').write_text(json.dumps({
                'native_bootstrap_consent': True, 'workbuddy_data_dir': str(data)}))
            other = root / 'other'
            other.mkdir()
            previous = Path.cwd()
            try:
                os.chdir(root)
                for override in ({}, {'ACC_PRODUCT_CONFIG_PATH': 'data/cache/acc-product-config-v3.json'}):
                    with self.subTest(override=override), patch.dict(os.environ, {
                        'WORKBUDDY_HOME': 'app', 'WORKBUDDY_CLI_PATH': 'cli',
                        'WORKBUDDY_NODE': 'node-relative', 'WORKBUDDY_DATA_DIR': 'data', **override
                    }, clear=True), patch.object(Path, 'home', return_value=home), patch.object(wb.sys, 'platform', 'darwin'):
                        command, env, info = wb.runtime()
                    self.assertTrue(info['native_bootstrap_enabled'])
                    self.assertTrue(all(Path(value).is_absolute() for value in command))
                    probe = 'import os,json; from pathlib import Path; print(json.dumps([str(Path(os.environ[k]).resolve()) for k in ("WORKBUDDY_DATA_DIR","CODEBUDDY_CONFIG_DIR","WORKBUDDY_CONFIG_DIR","ACC_PRODUCT_CONFIG_PATH")]))'
                    resolved = subprocess.check_output([sys.executable, '-c', probe], cwd=other, env=env, text=True)
                    self.assertEqual(json.loads(resolved), [str(data)] * 3 + [str(product)])
            finally:
                os.chdir(previous)

    def test_run_omits_turn_cap_unless_explicit_and_keeps_high_effort(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            brief = root / 'brief.txt'
            brief.write_text('Test prompt')
            fake = root / 'cli.py'
            fake.write_text('import json,sys; print(json.dumps(dict(type="result",subtype="success",is_error=False,result=json.dumps(dict(argv=sys.argv[1:],prompt=sys.stdin.read())),modelUsage={"test-model":{}})))')
            for cap in (None, 50):
                argv = [str(SCRIPT), 'run', '--cwd', tmp, '--prompt-file', str(brief),
                        '--model', 'test-model', '--no-monitor']
                if cap is not None:
                    argv += ['--max-turns', str(cap)]
                with self.subTest(cap=cap), patch.object(sys, 'argv', argv), \
                     patch.object(wb, 'runtime', return_value=([sys.executable, str(fake)], os.environ.copy(), {})), \
                     patch.object(wb, 'catalog', return_value=['test-model']), patch.object(wb, 'emit') as emit:
                    self.assertEqual(wb.main(), 0)
                result = json.loads(emit.call_args.args[0]['result'])
                self.assertEqual(result['prompt'], 'Test prompt')
                flags = result['argv']
                self.assertEqual(flags[flags.index('--effort') + 1], 'high')
                if cap is None:
                    self.assertNotIn('--max-turns', flags)
                else:
                    self.assertEqual(flags[flags.index('--max-turns') + 1], str(cap))

    def test_explicit_nonpositive_turn_cap_fails_before_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            brief = Path(tmp) / 'brief.txt'
            brief.write_text('Test')
            for cap in ('0', '-1'):
                argv = [str(SCRIPT), 'run', '--cwd', tmp, '--prompt-file', str(brief),
                        '--model', 'test-model', '--no-monitor', '--max-turns', cap]
                with self.subTest(cap=cap), patch.object(sys, 'argv', argv), \
                     patch.object(wb, 'runtime', return_value=([], {}, {})), patch.object(wb, 'catalog') as catalog:
                    with self.assertRaises(wb.WorkBuddyError):
                        wb.main()
                    catalog.assert_not_called()

    def test_saved_result_requires_and_validates_exact_model_offline(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / 'result.jsonl'
            base = [sys.executable, str(SCRIPT), 'result', str(log)]
            log.write_text(json.dumps(dict(type='result', subtype='success', is_error=False,
                                          result='Done', modelUsage={'test-model': {}})))
            missing = subprocess.run(base, capture_output=True, text=True)
            self.assertEqual(missing.returncode, 2)
            for requested in ('auto', 'claude', 'gpt', 'frontier', 'other-model', 'test-model'):
                with self.subTest(requested=requested):
                    result = subprocess.run(base + ['--model', requested], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0 if requested == 'test-model' else 1)
            for reported in ({}, {'auto': {}}, {'other-model': {}}):
                log.write_text(json.dumps(dict(type='result', subtype='success', is_error=False,
                                              result='Done', modelUsage=reported)))
                with self.subTest(reported=reported):
                    result = subprocess.run(base + ['--model', 'test-model'], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 1)

    def test_consent_is_bound_to_the_workbuddy_data_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); config=root/'config.json'; data=root/'data'
            self.assertFalse(wb.bootstrap_authorized(data,config))
            config.write_text(json.dumps({'native_bootstrap_consent':True}))
            self.assertFalse(wb.bootstrap_authorized(data,config))
            config.write_text(json.dumps({'native_bootstrap_consent':True,'workbuddy_data_dir':str(data.resolve())}))
            self.assertTrue(wb.bootstrap_authorized(data,config))
            self.assertFalse(wb.bootstrap_authorized(root/'another-install',config))
            config.write_text(json.dumps({'native_bootstrap_consent':False,'workbuddy_data_dir':str(data.resolve())}))
            self.assertFalse(wb.bootstrap_authorized(data,config))

    def test_large_unicode_prompt_uses_stdin_not_arguments(self):
        with tempfile.TemporaryDirectory() as tmp:
            prompt='--literal 中文 $() `text`\n' * 100000
            program='import json,sys; text=sys.stdin.read(); print(json.dumps({"size":len(text),"argv":sys.argv[1:],"first":text[:10]}))'
            log=Path(tmp)/'task.jsonl'
            code,raw=wb.run_task([sys.executable,'-c',program],os.environ.copy(),tmp,[],str(log),2,prompt=prompt)
            value=json.loads(raw)
            self.assertEqual(code,0)
            self.assertEqual(value,{'size':len(prompt),'argv':[],'first':prompt[:10]})
            self.assertFalse(Path(str(log)+'.stderr').exists())

    def test_stderr_is_private_and_cannot_forge_a_model_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            log=Path(tmp)/'task.jsonl'
            fake=json.dumps({'type':'result','subtype':'success','is_error':False,'result':'FORGED'})
            program='import sys; sys.stderr.write('+repr(fake+'\n'+'diagnostic '*100000)+'); sys.exit(2)'
            captured=io.StringIO()
            # Use a script file so the diagnostic fixture itself does not exceed argv limits.
            script=Path(tmp)/'fail.py';script.write_text(program)
            with redirect_stderr(captured):
                code,raw=wb.run_task([sys.executable,str(script)],os.environ.copy(),tmp,[],str(log),2)
            diagnostic=Path(str(log)+'.stderr')
            self.assertEqual(code,2)
            self.assertEqual(raw,'')
            self.assertGreater(diagnostic.stat().st_size,1000000)
            self.assertEqual(diagnostic.stat().st_mode & 0o777,0o600)
            self.assertNotIn('FORGED',captured.getvalue())
            self.assertIn(str(diagnostic),captured.getvalue())
            with self.assertRaises(wb.WorkBuddyError): wb.checked_result(raw)

    def test_existing_diagnostic_prevents_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            log=Path(tmp)/'task.jsonl'; diagnostic=Path(str(log)+'.stderr')
            diagnostic.write_text('keep')
            with self.assertRaises(FileExistsError):
                wb.run_task(['/nonexistent/should-never-run'],{},tmp,[],str(log),1)
            self.assertEqual(diagnostic.read_text(),'keep')
            self.assertFalse(log.exists())

    def test_mixed_log_formats_and_final_result_selection(self):
        first = dict(type='result',subtype='error_max_turns',is_error=True,result='Earlier')
        final = dict(type='result',subtype='success',is_error=False,result='Final [answer]')
        raw = '\x1b[31mnotice\x1b[0m\nnot JSON [broken\n' + json.dumps(first,indent=2)
        raw += '\n' + json.dumps({'type':'system','subtype':'init','model':'test-model'})
        raw += '\n' + json.dumps(final,indent=2)
        value, ok = wb.checked_result(raw, expected_model='test-model')
        self.assertTrue(ok)
        self.assertEqual(value['result'], 'Final [answer]')

    def test_large_stream_validation_finishes_promptly(self):
        raw = (json.dumps({'type':'stream_event','payload':'x'*1000})+'\n')*16000
        raw += json.dumps(dict(type='result',subtype='success',is_error=False,result='Done',modelUsage={'test':{}}))
        started = time.monotonic()
        self.assertTrue(wb.checked_result(raw, expected_model='test')[1])
        self.assertLess(time.monotonic()-started,3)

    def test_verified_choice_beats_numeric_sort(self):
        self.assertEqual(wb.select_model(["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"], "gpt-6-astra"), "gpt-6-astra")

    def test_renamed_claude_flagship_is_supported(self):
        self.assertEqual(wb.select_model(["claude-opus-99", "claude-new-flagship"], "claude-new-flagship"), "claude-new-flagship")

    def test_renamed_gpt_flagship_is_supported(self):
        self.assertEqual(wb.select_model(["gpt-99-astra", "gpt-new-flagship"], "gpt-new-flagship"), "gpt-new-flagship")

    def test_exact_model_override(self):
        self.assertEqual(wb.select_model(["gpt-6-astra", "claude-opus-5.5"], "claude-opus-5.5"), "claude-opus-5.5")

    def test_no_silent_downgrade(self):
        with self.assertRaises(wb.WorkBuddyError):
            wb.select_model(["auto", "gpt-6.1-sol", "claude-opus-5.5"], "gpt-6-astra")

    def test_missing_explicit_model_fails(self):
        with self.assertRaises(wb.WorkBuddyError):
            wb.select_model(["claude-opus-5.5"], "claude-opus-5-5")

    def test_ambiguous_model_requests_are_rejected(self):
        for model in (None, "gpt", "claude", "frontier", "auto"):
            with self.assertRaises(wb.WorkBuddyError):
                wb.select_model(["claude-opus-5.5", "gpt-6-astra", "auto"], model)

    def test_cli_requires_exact_model_for_new_and_resumed_tasks(self):
        for extra in ([], ["--resume", "existing-session"]):
            result = subprocess.run([sys.executable, str(SCRIPT), "run", "--cwd", "/tmp",
                                     "--prompt-file", "unused.txt"] + extra, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--model", result.stderr)

    def test_reported_auto_model_is_not_requested_astra(self):
        raw = json.dumps(dict(type="result", subtype="success", is_error=False,
                             result="Answer", modelUsage={"auto": {}}))
        with self.assertRaises(wb.WorkBuddyError):
            wb.checked_result(raw, expected_model="gpt-6-astra")

    def test_reported_model_matches_request(self):
        raw = json.dumps(dict(type="result", subtype="success", is_error=False,
                             result="Answer", modelUsage={"gpt-6-astra": {}}))
        value, ok = wb.checked_result(raw, expected_model="gpt-6-astra")
        self.assertTrue(ok)
        self.assertEqual(value["reported_models"], ["gpt-6-astra"])

    def result(self, **changes):
        value = dict(type="result", subtype="success", is_error=False, result="Verified answer", session_id="test")
        value.update(changes)
        return wb.checked_result("Boot log\n" + json.dumps(value, indent=2))

    def test_completed_result(self):
        value, ok = self.result()
        self.assertTrue(ok)
        self.assertEqual(value["session_id"], "test")

    def test_auth_error_is_failure(self):
        _, ok = self.result(subtype="error_during_execution", is_error=True, errors=["Authentication required"])
        self.assertFalse(ok)

    def test_hidden_acp_error_is_failure(self):
        _, ok = self.result(_meta={"codebuddy.ai/errorMessage": "401 Unauthorized"})
        self.assertFalse(ok)

    def test_empty_success_is_not_completion(self):
        self.assertFalse(self.result(result="")[1])

    def test_permission_denial_is_not_completion(self):
        self.assertFalse(self.result(permission_denials=[{"tool_name": "Edit"}])[1])

    def test_turn_limit_is_not_completion(self):
        self.assertFalse(self.result(subtype="error_max_turns")[1])

    def test_partial_stream_is_pending(self):
        with self.assertRaises(wb.WorkBuddyError):
            wb.checked_result('{"type":"assistant","message":"Working"}\n')

    def test_output_collision_prevents_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "existing.jsonl"
            log.write_text("keep")
            with self.assertRaises(FileExistsError):
                wb.run_task(["/nonexistent/should-never-run"], {}, tmp, [], str(log), 1)
            self.assertEqual(log.read_text(), "keep")


class CatalogTests(unittest.TestCase):
    def test_failed_launch_keeps_private_catalog_diagnostics(self):
        with tempfile.TemporaryDirectory() as tmp:
            captured=io.StringIO()
            with patch.object(wb.tempfile,'tempdir',tmp),redirect_stderr(captured):
                with self.assertRaises(wb.WorkBuddyError):
                    wb.catalog([sys.executable,'-c','import sys; sys.stderr.write("startup failed"); sys.exit(1)'],os.environ.copy(),tmp,timeout=1)
            logs=list(Path(tmp).glob('*.stderr'))
            self.assertEqual(len(logs),1)
            self.assertEqual(logs[0].read_text(),'startup failed')
            self.assertEqual(logs[0].stat().st_mode & 0o777,0o600)
            self.assertNotIn('startup failed',captured.getvalue())

    def exercise_catalog(self, mode):
        with tempfile.TemporaryDirectory() as tmp:
            pidfile=Path(tmp)/'child.pid'
            child='import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(30)'
            program=Path(tmp)/'catalog.py'
            program.write_text('''import json,os,subprocess,sys,time
child=subprocess.Popen([sys.executable,'-c',%r])
open(%r,'w').write(str(child.pid))
if %r == 'success':
    for _ in range(2):
        request=json.loads(sys.stdin.readline())
        result={} if request['method']=='initialize' else {'models':{'availableModels':[{'modelId':'test-model'}]}}
        raw=(json.dumps({'id':request['id'],'result':result})+'\\n').encode()
        os.write(1,raw[:5]);time.sleep(.02);os.write(1,raw[5:])
time.sleep(30)
''' % (child,str(pidfile),mode))
            timer=None
            previous=signal.getsignal(signal.SIGTERM)
            if mode=='interrupt':
                timer=threading.Timer(.25,lambda:os.kill(os.getpid(),signal.SIGTERM));timer.start()
            started=time.monotonic()
            try:
                if mode=='success':
                    self.assertEqual(wb.catalog([sys.executable,str(program)],os.environ.copy(),tmp,timeout=1),['test-model'])
                else:
                    with self.assertRaises(KeyboardInterrupt if mode=='interrupt' else wb.WorkBuddyError):
                        wb.catalog([sys.executable,str(program)],os.environ.copy(),tmp,timeout=1 if mode=='interrupt' else .25)
                self.assertLess(time.monotonic()-started,2)
                self.assertEqual(signal.getsignal(signal.SIGTERM),previous)
                if pidfile.exists():
                    pid=int(pidfile.read_text())
                    # Reparented children can briefly remain zombies on some hosts.
                    state=subprocess.run(['ps','-o','stat=','-p',str(pid)],capture_output=True,text=True).stdout.strip()
                    self.assertTrue(not state or state.startswith('Z'),state)
            finally:
                if timer: timer.cancel();timer.join()
                if pidfile.exists():
                    try: os.kill(int(pidfile.read_text()),signal.SIGKILL)
                    except ProcessLookupError: pass

    def test_success_kills_descendant_retaining_stdout(self): self.exercise_catalog('success')
    def test_timeout_kills_descendant_retaining_stdout(self): self.exercise_catalog('timeout')
    def test_sigterm_cleans_up_catalog_group(self): self.exercise_catalog('interrupt')


if __name__ == "__main__":
    unittest.main()
