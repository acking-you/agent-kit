import importlib.util
import io
import json
import socket
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
import urllib.request
import urllib.error

SCRIPTS=Path(__file__).resolve().parents[1]/'skills/claude-code-subagent/scripts'
sys.path.insert(0,str(SCRIPTS))
spec=importlib.util.spec_from_file_location('claude_code',SCRIPTS/'claude_code.py')
cc=importlib.util.module_from_spec(spec);spec.loader.exec_module(cc)


class NativeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=cc.root_dir(self.temp.name)
        self.ident='a'*24
        self.task=self.root/'tasks'/self.ident;self.task.mkdir()
        self.log=self.task/'public.jsonl';self.log.touch()
        self.transcript=self.task/'native.jsonl';self.transcript.touch()
        self.hook=self.task/'hook.json'
        cc.monitor.save(self.hook,{'session_id':'session','transcript_path':str(self.transcript)})
        self.info=dict(id=self.ident,title="fixture",cli='/fake/claude',job_id='abcd1234',session_id='session',cwd=str(self.task),model='model',effort='high',tools='Read',permission_mode='plan',
                       hook_record=str(self.hook),output=str(self.log),marker='turn-marker',offset=0,turn_seen=False,status='running',started=time.time())
        self.save()
    def save(self):cc.monitor.save(self.root/'runs'/(self.ident+'.json'),self.info)
    def job(self,state='working',**kw):return [dict(id='abcd1234',sessionId='session',state=state,**kw)]
    def write(self,items):self.transcript.write_text(''.join(json.dumps(i)+'\n' for i in items))
    def user(self,marker='turn-marker'):return {'type':'user','message':{'content':marker}}
    def assistant(self,text='done',model='model',**kw):return dict(type='assistant',uuid='u',message={'id':'message','model':model,'content':[{'type':'thinking','thinking':'PRIVATE_THOUGHT'}, {'type':'text','text':text}]},**kw)

    def settle(self, listing):
        cc.collect(self.root,self.info,listing)
        with patch.object(cc.time,'time',return_value=time.time()+2):
            return cc.collect(self.root,self.info,listing)

    def test_turn_boundary_and_thinking_not_copied(self):
        self.write([self.user('previous-turn'),self.assistant('old answer'),self.user(),self.assistant('new answer')])
        info=self.settle(self.job('done'))
        output=self.log.read_text();self.assertNotIn('PRIVATE_THOUGHT',output);self.assertNotIn('old answer',output)
        self.assertIn('new answer',output);self.assertEqual(info['status'],'completed');self.assertEqual(info['reported_model'],'model')

    def test_split_unicode_line_is_not_consumed_and_restart_uses_offset(self):
        self.write([self.user()]);cc.collect(self.root,self.info,self.job())
        message=json.dumps(self.assistant('你好'),ensure_ascii=False).encode()+b'\n'
        with self.transcript.open('ab') as f:f.write(message[:-2])
        saved=cc.collect(self.root,self.info,self.job());offset=saved['offset']
        with self.transcript.open('ab') as f:f.write(message[-2:])
        restarted=cc.record(self.root,self.ident);cc.collect(self.root,restarted,self.job('done'))
        self.assertGreater(restarted['offset'],offset);self.assertEqual(restarted['last_text'],'你好')
        with patch.object(cc,'jobs',return_value=self.job('done')),patch.object(cc.time,'time',return_value=time.time()+2):cc.refresh(self.root,self.ident)
        self.assertEqual(self.log.read_text().count('"subtype": "success"'),1)

    def test_missing_inventory_never_claims_completion(self):
        result=cc.collect(self.root,self.info,[])
        self.assertEqual(result['status'],'unknown');self.assertFalse(result.get('finalized',False))
        self.assertNotIn('"type": "result"',self.log.read_text())

    def test_blocked_session_stays_live(self):
        result=cc.collect(self.root,self.info,self.job('blocked',waitingFor='permission prompt'))
        self.assertEqual(result['status'],'blocked');self.assertIn('blocked',cc.ACTIVE)
        self.assertEqual(result['waiting_for'],'permission prompt');self.assertFalse(result.get('finalized',False))

    def test_api_error_and_missing_current_turn_fail(self):
        self.write([self.user(),self.assistant('API denied',isApiErrorMessage=True)])
        result=self.settle(self.job('done'))
        self.assertEqual(result['status'],'failed');self.assertEqual(result['error'],'API denied')
        self.info.update(started=time.time()-60,turn_seen=False,offset=0,finalized=False,terminal_status=None)
        self.write([]);self.assertEqual(self.settle(self.job('done'))['status'],'failed')

    def test_resume_rejects_busy_blocked_missing_and_overlapping(self):
        for listing in (self.job(),self.job('blocked'),[],self.job('done',status='busy')):
            with patch.object(cc,'jobs',return_value=listing),patch.object(cc,'native') as native:
                with self.assertRaises(RuntimeError):cc.launch(self.root,self.task,'follow up','model',previous=self.ident,cli='/fake/claude')
                native.assert_not_called()
        self.info.update(finalized=True,status='completed');self.save()
        other=dict(self.info,id='b'*24,session_id='copy',conversation_id=self.ident,finalized=False);cc.monitor.save(self.root/'runs'/('b'*24+'.json'),other)
        with patch.object(cc,'jobs',return_value=self.job('done')),patch.object(cc,'native') as native:
            with self.assertRaisesRegex(RuntimeError,'unfinished'):cc.launch(self.root,self.task,'follow up','model',previous=self.ident,cli='/fake/claude')
            native.assert_not_called()

    def test_dispatch_prompt_is_positional_and_grants_are_separate(self):
        listing=[{'id':'cafe1234','sessionId':'new-session','state':'working'}]
        with patch.object(cc,'native',return_value='backgrounded · cafe1234'),patch.object(cc,'jobs',return_value=listing):
            r=cc.launch(self.root,self.task,'--prompt\nhello','model',tools='Read,Bash',mode='acceptEdits',allowed_tools='Bash(python3 *)',cli='/fake/claude')
            args=cc.native.call_args.args[1]
        self.assertEqual(args[-2],'--');self.assertIn('--prompt\nhello',args[-1])
        self.assertNotIn('-p',args);self.assertNotIn('--dangerously-skip-permissions',args)
        self.assertEqual(args[args.index('--allowedTools')+1],'Bash(python3 *)')
        settings=json.loads((Path(r['hook_record']).parent/'settings.json').read_text())
        self.assertEqual(settings['env']['CLAUDE_CODE_DISABLE_BG_EXIT_HANDOFF'],'1');self.assertFalse(settings['autoMemoryEnabled'])
        self.assertEqual(r['session_id'],'new-session')

    def test_default_dispatch_has_all_tools_and_bypasses_permissions(self):
        listing=[{'id':'cafe1234','sessionId':'new-session','state':'working'}]
        with patch.object(cc,'native',return_value='backgrounded · cafe1234'),patch.object(cc,'jobs',return_value=listing):
            r=cc.launch(self.root,self.task,'Implement the authorized task','model',cli='/fake/claude')
            args=cc.native.call_args.args[1]
        self.assertEqual(r['permission_mode'],'bypassPermissions')
        self.assertEqual(r['tools'],'default')
        self.assertEqual(args[args.index('--permission-mode')+1],'bypassPermissions')
        self.assertEqual(args[args.index('--tools')+1],'default')
        self.assertIn('--dangerously-skip-permissions',args)

    def test_cli_defaults_match_unattended_dispatch(self):
        brief=self.task/'brief.md';brief.write_text('Implement the authorized task')
        with patch.object(cc,'launch',return_value={'id':'b'*24}) as launch,patch.object(cc,'panel',return_value='http://localhost/'),redirect_stdout(io.StringIO()):
            self.assertEqual(cc.main(['run','--state-dir',str(self.root),'--cwd',str(self.task),'--model','model','--prompt-file',str(brief)]),0)
        self.assertEqual(launch.call_args.args[4:7],('high','default','bypassPermissions'))

    def test_resume_can_explicitly_upgrade_permissions_without_changing_old_turn(self):
        self.info.update(finalized=True,status='stopped');self.save()
        with patch.object(cc,'jobs',side_effect=[self.job('stopped'),[{'id':'cafe1234','sessionId':'copy','state':'working'}]]),patch.object(cc,'native',return_value='backgrounded · cafe1234'):
            r=cc.launch(self.root,self.task,'Continue with authorized full permissions','ignored',previous=self.ident,cli='/fake/claude',resume_permission_mode='bypassPermissions',resume_tools='default')
            args=cc.native.call_args.args[1]
        self.assertEqual((r['permission_mode'],r['tools'],r['model'],r['effort']),('bypassPermissions','default','model','high'))
        self.assertIn('--dangerously-skip-permissions',args)
        self.assertIn('--resume',args)
        old=cc.record(self.root,self.ident)
        self.assertEqual((old['permission_mode'],old['tools']),('plan','Read'))

    def test_stop_requires_native_confirmation(self):
        self.write([self.user(),self.assistant('partial')])
        with patch.object(cc,'jobs',side_effect=[self.job()]+[self.job('stopped')]*10),patch.object(cc,'native',return_value=''):
            r=cc.stop(self.root,self.ident)
            self.assertEqual(r['status'],'stopped');self.assertTrue(r['finalized']);cc.native.assert_called_once_with('/fake/claude',['stop','abcd1234'])

    def test_resume_copy_records_lineage_and_keeps_permissions(self):
        self.info.update(finalized=True,status='completed',conversation_id='lineage');self.save()
        with patch.object(cc,'jobs',side_effect=[self.job('done'),[{'id':'cafe1234','sessionId':'copy','state':'working'}]]),patch.object(cc,'native',return_value='backgrounded · cafe1234'):
            r=cc.launch(self.root,self.task,'follow up','ignored',previous=self.ident,cli='/fake/claude')
        self.assertEqual(r['resume_source'],'session');self.assertEqual(r['session_id'],'copy');self.assertEqual(r['conversation_id'],'lineage');self.assertEqual(r['model'],'model');self.assertIn('UUID',r['resume_note'])

    def test_late_final_is_reconciled_after_terminal_state(self):
        self.write([self.user(),self.assistant('commentary')])
        self.settle(self.job('done'))
        with self.transcript.open('a') as f:f.write(json.dumps(self.assistant('actual final'))+'\n')
        with patch.object(cc,'jobs',return_value=self.job('done')):
            self.assertEqual(cc.refresh(self.root,self.ident)[0]['status'],'finishing')
            with patch.object(cc.time,'time',return_value=time.time()+2):
                result=cc.refresh(self.root,self.ident)[0]
        self.assertEqual(result['last_text'],'actual final');self.assertTrue(result['finalized'])
        tail=cc.monitor.Tail(str(self.log));tail.poll()
        self.assertEqual(tail.projection.final['text'],'actual final')

    def test_stop_reconciles_late_transcript_before_finalization(self):
        self.write([self.user(),self.assistant('commentary')]);self.settle(self.job('done'))
        with self.transcript.open('a') as f:f.write(json.dumps(self.assistant('late final'))+'\n')
        with patch.object(cc,'jobs',return_value=self.job('done')):
            result=cc.stop(self.root,self.ident)
        self.assertEqual(result['last_text'],'late final');self.assertTrue(result['finalized'])
        tail=cc.monitor.Tail(str(self.log));tail.poll();self.assertEqual(tail.projection.final['text'],'late final')

    def test_late_hook_recovers_missing_turn_failure(self):
        self.hook.unlink();self.info.update(started=time.time()-60)
        self.settle(self.job('done'));self.assertEqual(self.info['status'],'failed')
        self.write([self.user(),self.assistant('late hook final')])
        cc.monitor.save(self.hook,{'session_id':'session','transcript_path':str(self.transcript)})
        with patch.object(cc,'jobs',return_value=self.job('done')):
            cc.refresh(self.root,self.ident)
            with patch.object(cc.time,'time',return_value=time.time()+2):result=cc.refresh(self.root,self.ident)[0]
        self.assertEqual(result['status'],'completed');self.assertNotIn('error',result)

    def test_undispatched_resume_failure_does_not_own_latest_turn(self):
        self.info.update(finalized=True,status='stopped');self.save()
        with patch.object(cc,'jobs',return_value=self.job('stopped')),patch.object(cc,'native',side_effect=FileNotFoundError('CLI missing')):
            with self.assertRaises(FileNotFoundError):cc.launch(self.root,self.task,'brief','model',previous=self.ident,cli='/fake/claude')
        with patch.object(cc,'jobs',return_value=self.job('stopped')),patch.object(cc,'native',return_value='backgrounded · cafe1234'):
            result=cc.launch(self.root,self.task,'retry','model',previous=self.ident,cli='/fake/claude')
        self.assertEqual(result['job_id'],'cafe1234')

    def test_ambiguous_dispatch_is_reconciled_by_unique_native_name(self):
        with patch.object(cc,'jobs',return_value=[]),patch.object(cc,'native',side_effect=RuntimeError('unrecognized receipt')):
            with self.assertRaises(RuntimeError):cc.launch(self.root,self.task,'brief','model',cli='/fake/claude')
        saved=[cc.monitor.read(p) for p in (self.root/'runs').glob('*.json') if p.stem!=self.ident][0]
        self.assertEqual(saved['status'],'unknown');self.assertFalse(saved.get('finalized'))
        with patch.object(cc,'jobs',return_value=[dict(id='cafe1234',sessionId='native-session',state='working',name='cc-'+saved['id'])]):
            recovered=cc.refresh(self.root,saved['id'])[0]
        self.assertEqual(recovered['status'],'running');self.assertEqual(recovered['job_id'],'cafe1234')

    def test_helper_is_independent_of_another_monitor_module(self):
        from types import ModuleType
        unrelated=ModuleType('monitor')
        with patch.dict(sys.modules,{'monitor':unrelated}):
            spec=importlib.util.spec_from_file_location('isolated_claude_helper',SCRIPTS/'claude_code.py')
            helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
            projection=helper.monitor.Projection()
            projection.accept({'type':'result','subtype':'success','result':'own adapter'})
        self.assertEqual(projection.final['text'],'own adapter')

    def test_native_projection_does_not_invent_metrics(self):
        projection=cc.monitor.Projection()
        projection.accept({'type':'assistant','message':{'id':'m','content':[{'type':'tool_use','id':'t','name':'Read','input':{'file_path':'proof.md'}}]}})
        self.assertEqual(projection.activity['phase'],'tool_running')
        projection.accept({'type':'result','subtype':'success','result':'done'})
        self.assertIsNone(projection.final['turns']);self.assertIsNone(projection.final['permission_denials'])

    def test_inventory_failure_isolated_by_recorded_cli(self):
        other=dict(self.info,id='b'*24,cli='/valid/claude',job_id='goodjob',session_id='good-session',title='healthy')
        cc.monitor.save(self.root/'runs'/('b'*24+'.json'),other)
        def inventory(cli):
            if cli=='/fake/claude':raise FileNotFoundError('old binary removed')
            return [dict(id='goodjob',sessionId='good-session',state='working')]
        with patch.object(cc,'jobs',side_effect=inventory) as query:
            results={r['id']:r for r in cc.refresh(self.root)}
        self.assertEqual(results[self.ident]['status'],'unknown')
        self.assertIn('old binary removed',results[self.ident]['observation_error'])
        self.assertEqual(results['b'*24]['status'],'running')
        self.assertEqual({call.args[0] for call in query.call_args_list},{'/fake/claude','/valid/claude'})

    def test_api_retry_success_clears_failure_and_replaces_late_result(self):
        self.write([self.user(),self.assistant('Transient API error',isApiErrorMessage=True)])
        self.settle(self.job('done'));self.assertEqual(self.info['status'],'failed')
        with self.transcript.open('a') as f:f.write(json.dumps(self.assistant('successful retry'))+'\n')
        with patch.object(cc,'jobs',return_value=self.job('done')):
            cc.refresh(self.root,self.ident)
            with patch.object(cc.time,'time',return_value=time.time()+2):result=cc.refresh(self.root,self.ident)[0]
        self.assertEqual(result['status'],'completed');self.assertEqual(result['last_text'],'successful retry')
        self.assertFalse(result['api_error']);self.assertNotIn('error',result)
        projection=cc.monitor.Tail(str(self.log));projection.poll()
        self.assertEqual(projection.projection.final['subtype'],'success')
        self.assertEqual(projection.projection.final['errors'],'[]')

    def test_later_managed_turn_is_excluded(self):
        self.write([self.user(),self.assistant('mine'),self.user('[Managed task turn newer]'),self.assistant('another turn')])
        self.settle(self.job('done'))
        self.assertEqual(self.info['last_text'],'mine');self.assertNotIn('another turn',self.log.read_text())

    def test_dispatch_inventory_failure_is_recoverable(self):
        with patch.object(cc,'native',return_value='backgrounded · cafe1234'),patch.object(cc,'jobs',side_effect=RuntimeError('temporary failure')):
            result=cc.launch(self.root,self.task,'brief','model',cli='/fake/claude')
        self.assertEqual(result['status'],'unknown');self.assertFalse(result.get('finalized'))
        with patch.object(cc,'jobs',return_value=[dict(id='cafe1234',sessionId='copy',state='working')]):
            recovered=cc.refresh(self.root,result['id'])[0]
        self.assertEqual(recovered['status'],'running');self.assertNotIn('observation_error',recovered)

    def test_resume_requires_latest_turn(self):
        self.info.update(finalized=True,status='completed');self.save()
        newer=dict(self.info,id='b'*24,session_id='copy',conversation_id=self.ident,started=time.time()+10)
        cc.monitor.save(self.root/'runs'/('b'*24+'.json'),newer)
        with patch.object(cc,'jobs',return_value=self.job('done')),patch.object(cc,'native') as native:
            with self.assertRaisesRegex(RuntimeError,'latest'):cc.launch(self.root,self.task,'brief','model',previous=self.ident,cli='/fake/claude')
            native.assert_not_called()

    def test_panel_controls_require_same_origin_and_registered_id(self):
        server=cc.monitor.MonitorServer(self.root);server.RequestHandlerClass=cc.Handler
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.addCleanup(lambda:(server.shutdown(),server.server_close(),thread.join()))
        origin=f'http://127.0.0.1:{server.server_port}';url=origin+'/'+server.token+'/control/'+self.ident
        def request(headers,data=b'{"action":"stop"}',target=url):return urllib.request.Request(target,data=data,headers=headers,method='POST')
        with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(request({'Content-Type':'application/json'}));
        e.exception.close();self.assertEqual(e.exception.code,403)
        with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(request({'Content-Type':'application/json','Origin':'https://evil.example'}))
        e.exception.close();self.assertEqual(e.exception.code,403)
        headers={'Content-Type':'application/json','Origin':origin}
        with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(request(headers,data=b'[]'))
        e.exception.close();self.assertEqual(e.exception.code,409)
        with patch.object(cc,'stop',return_value=self.info) as stop:
            with urllib.request.urlopen(request(headers)) as response:self.assertEqual(json.load(response)['run']['id'],self.ident)
            stop.assert_called_once_with(self.root,self.ident)
        with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(request(headers,target=url[:-24]+'f'*24))
        e.exception.close();self.assertEqual(e.exception.code,409)

    def test_monitor_restart_keeps_origin_and_private_capability(self):
        first=cc.monitor.MonitorServer(self.root)
        port,token=first.server_port,first.token
        first.server_close()
        second=cc.monitor.MonitorServer(self.root);self.addCleanup(second.server_close)
        self.assertEqual((second.server_port,second.token),(port,token))
        endpoint=self.root/'endpoint.json'
        self.assertEqual(endpoint.stat().st_mode & 0o777,0o600)
        self.assertEqual(cc.monitor.read(endpoint),{'port':port,'token':token})

    def test_live_panel_migrates_endpoint_before_restart(self):
        info={'pid':123,'port':54321,'token':'a'*43}
        with patch.object(cc.monitor,'server_info',return_value=info):
            url=cc.panel(self.root)
        self.assertEqual(url,'http://127.0.0.1:54321/'+'a'*43+'/')
        self.assertEqual(cc.monitor.endpoint_info(self.root),{'port':54321,'token':'a'*43})

    def test_occupied_monitor_port_falls_back_without_changing_capability(self):
        occupied=socket.socket();self.addCleanup(occupied.close)
        occupied.bind(('127.0.0.1',0));occupied.listen(1)
        port=occupied.getsockname()[1];token='b'*43
        cc.monitor.save(self.root/'endpoint.json',{'port':port,'token':token})
        server=cc.monitor.MonitorServer(self.root);self.addCleanup(server.server_close)
        self.assertNotEqual(server.server_port,port);self.assertEqual(server.token,token)
        self.assertEqual(cc.monitor.endpoint_info(self.root),{'port':server.server_port,'token':token})


    def input_reader(self):
        return cc.user_inputs.UserInputs(self.root, self.info)

    def test_inputs_scope_native_text_and_attachments_without_tool_or_thinking_data(self):
        marker='[Managed task turn '+self.ident+']'
        self.info['marker']=marker
        first=dict(self.user(marker+'\n  Original\n\nline  '),uuid='one',timestamp='2026-10-12T12:00:00Z')
        follow={'type':'user','uuid':'two','message':{'content':[
            {'type':'text','text':'Follow up <script>literal</script>'},
            {'type':'image','source':{'data':'PRIVATE_IMAGE'}},
            {'type':'document','source':{'url':'PRIVATE_URL'}},
            {'type':'tool_result','content':'PRIVATE_TOOL','tool_use_id':'t'},
        ]}}
        self.write([self.user('older prompt'),self.assistant(),first,
            dict(self.user('PRIVATE_META'),isMeta=True),
            dict(self.user('PRIVATE_SUMMARY'),isCompactSummary=True),
            {'type':'user','message':{'content':[{'type':'tool_result','content':marker+'\nNOT_INPUT'}]}},
            follow,follow,
            dict(self.user('Follow up <script>literal</script>'),uuid='three'),
            self.user('[Managed task turn '+'b'*24+']\nOTHER_TURN'),
            self.user('AFTER_OTHER')])
        result=self.input_reader().snapshot()
        self.assertEqual(result['source'],'transcript')
        self.assertEqual([m['text'] for m in result['messages']],[
            '  Original\n\nline  ','Follow up <script>literal</script>','Follow up <script>literal</script>'])
        self.assertEqual(result['messages'][1]['attachments'],['image','document'])
        for secret in ['PRIVATE','OTHER_TURN','AFTER_OTHER','NOT_INPUT','older prompt']:
            self.assertNotIn(secret,json.dumps(result))

    def test_input_incremental_partial_line_and_replaced_transcript(self):
        reader=self.input_reader()
        self.write([self.user('turn-marker\nfirst')])
        self.assertEqual(reader.snapshot()['messages'][0]['text'],'first')
        message=json.dumps(self.user('你好'),ensure_ascii=False).encode()+b'\n'
        with self.transcript.open('ab') as f:f.write(message[:-4])
        self.assertEqual(len(reader.snapshot()['messages']),1)
        with self.transcript.open('ab') as f:f.write(message[-4:])
        self.assertEqual(reader.snapshot()['messages'][-1]['text'],'你好')
        self.assertEqual(len(reader.snapshot()['messages']),2)
        self.write([self.user('turn-marker\nx')])
        self.assertEqual([m['text'] for m in reader.snapshot()['messages']],['x'])
        self.transcript.unlink()
        self.assertTrue(reader.snapshot()['unavailable'])
        self.write([self.user('turn-marker\nreplacement')])
        self.assertEqual([m['text'] for m in reader.snapshot()['messages']],['replacement'])

    def test_input_fallback_is_unconfirmed_and_recovers_late_hook(self):
        (self.task/'brief.md').write_text('Saved dispatch\nkeep spacing  ')
        self.hook.unlink()
        reader=self.input_reader()
        self.assertEqual(reader.snapshot()['source'],'brief')
        self.write([self.user('turn-marker\nActual native input')])
        cc.monitor.save(self.hook,{'transcript_path':str(self.transcript)})
        result=reader.snapshot()
        self.assertEqual(result['source'],'transcript')
        self.assertEqual(result['messages'][0]['text'],'Actual native input')
        (self.task/'brief.md').unlink();self.hook.unlink()
        self.assertEqual(self.input_reader().snapshot()['source'],'unavailable')
        (self.task/'brief.md').write_bytes(b'\xff')
        self.assertEqual(self.input_reader().snapshot()['source'],'unavailable')

    def test_inputs_keep_first_and_latest_with_explicit_display_limits(self):
        self.write([self.user('turn-marker\n'+'x'*61000)]+[
            dict(self.user(str(i)+'y'*10000),uuid=str(i)) for i in range(80)])
        result=self.input_reader().snapshot()
        self.assertTrue(result['messages'][0]['truncated'])
        self.assertEqual(len(result['messages'][0]['text']),60000)
        self.assertTrue(result['messages'][-1]['text'].startswith('79'))
        self.assertGreater(result['omitted'],0)
        self.assertLessEqual(sum(len(m['text']) for m in result['messages']),240000)
        self.assertLessEqual(len(result['messages']),64)
        self.write([self.user('turn-marker\nfirst')]+[
            dict(self.user(str(i)),uuid=str(i)) for i in range(100)])
        result=self.input_reader().snapshot()
        self.assertEqual(len(result['messages']),64)
        self.assertEqual(result['omitted'],37)

    def test_inputs_do_not_treat_quoted_marker_as_a_new_turn(self):
        self.write([self.user('turn-marker\nfirst'),
            self.user('Quote:\n[Managed task turn '+'b'*24+']'),
            self.user('after quotation')])
        self.assertEqual(len(self.input_reader().snapshot()['messages']),3)

    def test_old_terminal_logs_include_inputs_without_native_job_query(self):
        self.write([self.user('turn-marker\nActual input'),self.assistant('done')])
        self.info=self.settle(self.job('done'))
        before=(self.root/'runs'/(self.ident+'.json')).read_bytes()
        output=io.StringIO()
        with patch.object(cc,'jobs',side_effect=AssertionError('No terminal job poll')),redirect_stdout(output):
            self.assertEqual(cc.main(['logs',self.ident,'--state-dir',str(self.root)]),0)
        result=json.loads(output.getvalue())
        self.assertEqual(result['user_inputs']['messages'][0]['text'],'Actual input')
        self.assertEqual(result['final']['text'],'done')
        self.assertEqual((self.root/'runs'/(self.ident+'.json')).read_bytes(),before)

    def test_sse_snapshot_includes_input_only_behind_registered_capability(self):
        self.write([self.user('turn-marker\nActual input'),self.assistant('done')])
        self.info=self.settle(self.job('done'))
        server=cc.monitor.MonitorServer(self.root);server.RequestHandlerClass=cc.Handler
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.addCleanup(lambda:(server.shutdown(),server.server_close(),thread.join()))
        origin=f'http://127.0.0.1:{server.server_port}'
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(origin+'/bad/events/'+self.ident,timeout=3)
        error.exception.close()
        with urllib.request.urlopen(origin+'/'+server.token+'/events/'+self.ident,timeout=3) as response:
            self.assertEqual(response.readline().decode().strip(),'event: snapshot')
            result=json.loads(response.readline().decode().removeprefix('data: '))
        self.assertEqual(result['user_inputs']['messages'][0]['text'],'Actual input')
        self.assertEqual(result['run']['status'],'completed')
        self.assertEqual(result['final']['text'],'done')
        self.assertNotIn('PRIVATE_THOUGHT',json.dumps(result))


    def test_sse_user_only_followup_updates_without_an_assistant_reply(self):
        native_info=patch.object(cc.monitor,'run_info',side_effect=cc.monitor.read)
        native_info.start();self.addCleanup(native_info.stop)
        self.write([self.user('turn-marker\nInitial input')])
        cc.collect(self.root,self.info,self.job())
        server=cc.monitor.MonitorServer(self.root);server.RequestHandlerClass=cc.Handler
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.addCleanup(lambda:(server.stopping.set(),server.shutdown(),server.server_close(),thread.join()))
        url=f'http://127.0.0.1:{server.server_port}/{server.token}/events/{self.ident}'
        with urllib.request.urlopen(url,timeout=3) as response:
            self.assertEqual(response.readline().decode().strip(),'event: snapshot')
            first=json.loads(response.readline().decode().removeprefix('data: '))
            response.readline()
            self.assertEqual(len(first['user_inputs']['messages']),1)
            with self.transcript.open('a') as stream:
                stream.write(json.dumps(dict(self.user('Native follow-up'),uuid='next'))+'\n')
            cc.collect(self.root,self.info,self.job())
            self.assertEqual(response.readline().decode().strip(),'event: update')
            result=json.loads(response.readline().decode().removeprefix('data: '))
        self.assertEqual([m['text'] for m in result['user_inputs']['messages']],['Initial input','Native follow-up'])
        self.assertEqual(result['cards'],[])
        self.assertEqual(result['run']['status'],'running')


    def test_native_local_command_and_stdout_are_not_model_input(self):
        self.write([self.user('turn-marker\nActual prompt'),
            dict(self.user('<local-command-caveat>Not sent as a request</local-command-caveat>'),isMeta=True,promptId='local'),
            dict(self.user('<command-name>/exit</command-name>'),promptId='local'),
            dict(self.user('<local-command-stdout>(no content)</local-command-stdout>'),promptId='local'),
            dict(self.user('Explain this: <command-name>/exit</command-name>'),promptId='human'),
        ])
        result=self.input_reader().snapshot()
        self.assertEqual([m['text'] for m in result['messages']],[
            'Actual prompt','Explain this: <command-name>/exit</command-name>'])


if __name__=='__main__':unittest.main()
