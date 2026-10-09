import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener

SCRIPTS = Path(__file__).resolve().parents[1] / 'skills/workbuddy-subagent/scripts'
sys.path.insert(0, str(SCRIPTS))
import monitor
import workbuddy


def message(mid, *blocks):
    return {'type': 'assistant', '_messageId': mid, 'message': {'id': mid, 'content': list(blocks)}}


def partial(mid, typ, **extra):
    return {'type': 'stream_event', '_messageId': mid, 'event': dict(type=typ, **extra)}


class ProjectionTests(unittest.TestCase):
    def test_partial_and_final_text_are_one_card(self):
        p = monitor.Projection()
        p.accept(partial('m', 'content_block_delta', delta={'type':'text_delta','text':'Hello '}))
        p.accept(partial('m', 'content_block_delta', delta={'type':'text_delta','text':'world'}))
        self.assertEqual(p.cards['m:text']['text'], 'Hello world')
        self.assertTrue(p.cards['m:text']['streaming'])
        p.accept(message('m', {'type':'text','text':'Hello world'}))
        self.assertEqual(len(p.cards), 1)
        self.assertFalse(p.cards['m:text']['streaming'])

    def test_thinking_and_private_metadata_never_projected(self):
        p = monitor.Projection()
        event = partial('m','content_block_delta',delta={'type':'thinking_delta','thinking':'PRIVATE_THOUGHT'})
        event['__timestamp'] = '2026-10-09T08:28:46Z'
        p.accept(event)
        self.assertEqual(p.snapshot()['activity'], {'phase':'thinking','last_event_at':'2026-10-09T08:28:46Z','events':1})
        event = message('m', {'type':'thinking','thinking':'PRIVATE_THOUGHT'}, {'type':'text','text':'Public answer'})
        event['_meta'] = {'credential':'PRIVATE_KEY'}
        p.accept(event)
        data = json.dumps(p.snapshot())
        self.assertNotIn('PRIVATE', data)
        self.assertIn('Public answer', data)

    def test_multiple_streamed_and_completed_blocks_preserve_all_text(self):
        p=monitor.Projection()
        p.accept(partial('m','content_block_start',index=0,content_block={'type':'text','text':'First'}))
        p.accept(message('m',{'type':'text','text':'First'}))
        p.accept(partial('m','content_block_start',index=2,content_block={'type':'text','text':'Second'}))
        p.accept(partial('m','content_block_delta',index=2,delta={'type':'text_delta','text':' block'}))
        p.accept(message('m',{'type':'text','text':'Second block'}))
        self.assertEqual(p.cards['m:text']['text'],'First\nSecond block')
        p.accept(message('m',{'type':'text','text':'First'},{'type':'text','text':'Second block'}))
        self.assertEqual(p.cards['m:text']['text'],'First\nSecond block')
        self.assertEqual(len(p.cards),1)

    def test_nonstreaming_per_block_envelopes_and_replay(self):
        p=monitor.Projection()
        for uuid,text in [('a','Step'),('b','Step two'),('c','Step two'),('c','Step two')]:
            event=message('m',{'type':'text','text':text});event['uuid']=uuid
            p.accept(event)
        self.assertEqual(p.cards['m:text']['text'],'Step\nStep two\nStep two')

    def test_completed_blocks_without_ids_are_not_guessed_to_be_duplicates(self):
        p=monitor.Projection()
        for text in ['Same','Same']:
            p.accept(message('m',{'type':'text','text':text}))
        self.assertEqual(p.cards['m:text']['text'],'Same\nSame')

    def test_tool_partial_completion_and_result_merge(self):
        p = monitor.Projection()
        tool = {'type':'tool_use','id':'call1','name':'Edit','input':{}}
        p.accept(partial('m','content_block_start',index=1,content_block=tool))
        p.accept(partial('m','content_block_delta',index=1,delta={'type':'input_json_delta','partial_json':'{"file_path":'}))
        self.assertEqual(p.cards['tool:call1']['state'],'preparing')
        tool['input'] = {'file_path':'a.py','old_string':'bad','new_string':'good'}
        p.accept(message('m', tool))
        self.assertEqual(p.cards['tool:call1']['state'],'running')
        self.assertIn('-bad',p.cards['tool:call1']['diff'])
        p.accept({'type':'user','message':{'content':[{'type':'tool_result','tool_use_id':'call1','content':'Applied','is_error':False}]}})
        self.assertEqual(len(p.cards),1)
        self.assertEqual(p.cards['tool:call1']['state'],'succeeded')
        self.assertEqual(p.cards['tool:call1']['result'],'Applied')

    def test_failed_tool_is_not_a_successful_edit(self):
        p = monitor.Projection()
        p.accept(message('m',{'type':'tool_use','id':'c','name':'Write','input':{'file_path':'x','content':'new'}}))
        p.accept({'type':'user','message':{'content':[{'type':'tool_result','tool_use_id':'c','content':'Denied','is_error':True}]}})
        self.assertEqual(p.cards['tool:c']['state'],'failed')

    def test_partial_utf8_line_retried_and_replay_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'log'
            raw = (json.dumps(message('m', {'type':'text','text':'你好'}), ensure_ascii=False)+'\n').encode()
            cut = raw.index('你'.encode())+1
            path.write_bytes(raw[:cut])
            tail = monitor.Tail(path); tail.poll()
            self.assertEqual(tail.offset,0)
            with path.open('ab') as out: out.write(raw[cut:])
            tail.poll(); first = tail.projection.snapshot()
            tail.poll(); self.assertEqual(first,tail.projection.snapshot())
            replay = monitor.Tail(path); replay.poll()
            self.assertEqual(first,replay.projection.snapshot())
            self.assertEqual(first['cards'][0]['text'],'你好')

    def test_replaced_log_resets_projection(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'log'; path.write_text(json.dumps(message('m',{'type':'text','text':'old'}))+'\n')
            tail = monitor.Tail(path); tail.poll()
            new = Path(tmp)/'new'; new.write_text(json.dumps(message('n',{'type':'text','text':'new'}))+'\n'); new.replace(path)
            self.assertTrue(tail.poll())
            self.assertEqual([c['text'] for c in tail.projection.cards.values()],['new'])

    def test_dead_or_stale_runner_is_interrupted(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'run.json'
            monitor.save(p,{'status':'running','pid':os.getpid(),'heartbeat':time.time()-100})
            self.assertEqual(monitor.run_info(p)['status'],'interrupted')
            monitor.save(p,{'status':'completed','pid':None})
            self.assertEqual(monitor.run_info(p)['status'],'completed')


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=monitor.state_dir(self.tmp.name)
        self.server=monitor.MonitorServer(self.root)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
        self.base=f'http://127.0.0.1:{self.server.server_port}/{self.server.token}/'
        self.client=build_opener(ProxyHandler({}))

    def tearDown(self):
        self.server.stopping.set(); self.server.shutdown(); self.server.server_close(); self.thread.join(); self.tmp.cleanup()

    def test_loopback_token_origin_host_and_no_mutations(self):
        with self.client.open(self.base) as response:
            self.assertIn("frame-ancestors 'none'",response.headers['Content-Security-Policy'])
            self.assertEqual(response.headers['Cache-Control'],'no-store')
        for request,code in [(Request(self.base+'runs',headers={'Origin':'https://untrusted.example'}),403),
                             (Request(self.base+'runs',headers={'Host':'untrusted.example'}),403),
                             (Request(self.base.replace(self.server.token,'wrong')+'runs'),404),
                             (Request(self.base+'runs',method='POST'),501),
                             (Request(self.base+'events/../../etc/passwd'),404)]:
            with self.assertRaises(HTTPError) as error: self.client.open(request)
            self.assertEqual(error.exception.code,code)
            error.exception.close()

    def test_preference_bootstrap_is_served_under_the_private_url(self):
        with self.client.open(self.base+'preferences.js') as response:
            self.assertEqual(response.headers.get_content_type(), 'text/javascript')
            self.assertIn(b'WorkBuddyPreferences', response.read())
        with self.client.open(self.base) as response:
            html = response.read().decode()
            self.assertLess(html.index('src="preferences.js"'), html.index('href="style.css"'))

    def test_final_append_between_log_poll_and_status_read_is_not_lost(self):
        log=self.root/'race.jsonl'; log.write_text('')
        record=monitor.RunRecord(self.root,output=str(log),session_id='s',model='test',profile='review',cwd='/tmp')
        original=monitor.Tail.poll
        once=threading.Event()
        def racing_poll(tail):
            result=original(tail)
            if not once.is_set():
                once.set()
                log.write_text(json.dumps(message('last',{'type':'text','text':'Final append'}))+'\n')
                record.finish('completed')
            return result
        with patch.object(monitor.Tail,'poll',racing_poll):
            with self.client.open(self.base+'events/'+record.id,timeout=3) as response:
                response.readline()
                data=json.loads(response.readline().decode()[6:])
                self.assertEqual(data['cards'][0]['text'],'Final append')
                self.assertEqual(data['run']['status'],'completed')

    def test_sse_live_update_then_reconnect_replays_once(self):
        log=self.root/'log.jsonl'; log.write_text('')
        record=monitor.RunRecord(self.root,output=str(log),session_id='s',model='test',profile='review',cwd='/tmp')
        record.update(status='running')
        stream=self.client.open(self.base+'events/'+record.id,timeout=3)
        def event(response):
            name=response.readline().decode().strip()
            data=json.loads(response.readline().decode()[6:]); response.readline()
            return name,data
        self.assertEqual(event(stream)[0],'event: snapshot')
        with log.open('a') as out: out.write(json.dumps(message('m',{'type':'text','text':'first'}))+'\n')
        name,data=event(stream); self.assertEqual(name,'event: update'); self.assertEqual(data['cards'][0]['text'],'first')
        stream.close()
        record.finish('completed')
        with self.client.open(self.base+'events/'+record.id,timeout=3) as replay:
            name,data=event(replay)
            self.assertEqual(name,'event: snapshot'); self.assertEqual(len(data['cards']),1)
            self.assertEqual(data['run']['status'],'completed'); self.assertEqual(event(replay)[0],'event: done')
        self.assertEqual(record.path.stat().st_mode & 0o777,0o600)


class RunnerIntegrationTests(unittest.TestCase):
    def test_timeout_kills_descendant_holding_stdout(self):
        child='import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("child ready",flush=True); time.sleep(60)'
        parent='import subprocess,sys,time; subprocess.Popen([sys.executable,"-c",'+repr(child)+']); time.sleep(60)'
        start=time.monotonic()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(workbuddy.WorkBuddyError,'timed out'):
                workbuddy.run_task([sys.executable,'-c',parent],os.environ.copy(),tmp,[],str(Path(tmp)/'log'),0.5,stop_grace=0.1)
        self.assertLess(time.monotonic()-start,3)

    def invoke(self, tmp, events):
        root=Path(tmp); prompt=root/'prompt'; prompt.write_text('Test only')
        program='import json; events='+repr(events)+'; [print(json.dumps(e),flush=True) for e in events]'
        argv=['workbuddy.py','run','--cwd',tmp,'--model','test-model','--prompt-file',str(prompt),'--tools','']
        with patch.object(sys,'argv',argv),patch.object(workbuddy,'runtime',return_value=([sys.executable,'-c',program],os.environ.copy(),{})),patch.object(workbuddy,'catalog',return_value=['test-model']),patch.dict(os.environ,WORKBUDDY_MONITOR_DIR=tmp),patch.object(monitor,'ensure_server',return_value='http://127.0.0.1:1/token/'),patch.object(workbuddy,'emit'):
            return workbuddy.main()

    def test_success_validates_and_persists_private_auto_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            event={'type':'result','subtype':'success','is_error':False,'result':'ok','modelUsage':{'test-model':{}}}
            self.assertEqual(self.invoke(tmp,[event]),0)
            record=monitor.read(next((Path(tmp)/'runs').glob('*.json')))
            self.assertEqual(record['status'],'completed')
            self.assertEqual(Path(record['output']).stat().st_mode & 0o777,0o600)

    def test_no_final_result_and_model_mismatch_fail(self):
        for events in [[],[{'type':'result','subtype':'success','is_error':False,'result':'ok','modelUsage':{'wrong-model':{}}}]]:
            with tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(workbuddy.WorkBuddyError): self.invoke(tmp,events)
                record=monitor.read(next((Path(tmp)/'runs').glob('*.json')))
                self.assertEqual(record['status'],'failed')
                self.assertTrue(record['error'])


if __name__ == '__main__': unittest.main()
