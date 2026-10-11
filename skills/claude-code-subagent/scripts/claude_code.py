#!/usr/bin/env python3
"""Native Claude Code background sessions and a private local control panel."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
# Load this skill's adapter independently of any other skill named monitor.
_spec=importlib.util.spec_from_file_location("claude_code_monitor",HERE/"monitor.py")
monitor=importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(monitor)
ACTIVE = {"starting", "running", "blocked", "unknown", "finishing"}
ID = re.compile(r"^[a-f0-9]{24}$")


class NativeRejected(RuntimeError):
    """The native launcher exited nonzero rather than acknowledging dispatch."""


def now():
    return datetime.now(timezone.utc).isoformat()


def root_dir(value=None):
    root = Path(value or os.environ.get("CLAUDE_SUBAGENT_DIR", Path.home()/".claude-code-subagent")).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ("tasks", "runs"):
        (root/name).mkdir(exist_ok=True, mode=0o700)
    return root


def cli_path():
    path = os.environ.get("CLAUDE_SUBAGENT_CLI") or shutil.which("claude")
    if not path:
        raise RuntimeError("Claude Code not found. Install Claude Code and sign in through its native login.")
    return os.path.abspath(os.path.expanduser(path))


def native(cli, args, cwd=None, timeout=45):
    proc = subprocess.run([cli, *args], cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
    if proc.returncode:
        # No debug log or credential-bearing environment is returned to the browser.
        raise NativeRejected((proc.stderr or proc.stdout).strip()[-3000:] or f"Claude Code exited {proc.returncode}")
    return proc.stdout


def jobs(cli):
    result = json.loads(native(cli, ["agents", "--json", "--all"]))
    if not isinstance(result, list):
        raise RuntimeError("Unexpected Claude Code session inventory")
    return result


@contextmanager
def lock(root):
    with (root/"control.lock").open("a") as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        yield


def record(root, ident):
    if not ID.fullmatch(ident):
        raise RuntimeError("Invalid task ID")
    result = monitor.read(root/"runs"/(ident+".json"))
    if not result:
        raise RuntimeError("Task not found in this installation")
    return result


def job_for(info, listing):
    job=next((j for j in listing if j.get("id") == info.get("job_id") or (not info.get("job_id") and j.get("name")=="cc-"+info["id"])),None)
    if job: info["job_id"]=job["id"]
    return job


def public_event(item):
    """Project native transcript envelopes; never copy thinking or raw metadata."""
    kind = item.get("type")
    content = (item.get("message") or {}).get("content", [])
    if kind not in ("assistant", "user") or not isinstance(content, list):
        return None
    blocks = []
    for b in content:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text" and kind == "assistant":
            blocks.append({"type":"text", "text":b.get("text", "")})
        elif b.get("type") == "tool_use":
            blocks.append({k:b[k] for k in ("type", "id", "name", "input") if k in b})
        elif b.get("type") == "tool_result":
            blocks.append({"type":"tool_result", "tool_use_id":b.get("tool_use_id"),
                           "is_error":bool(b.get("is_error")), "content":monitor.public_content(b.get("content"))})
    if not blocks:
        return None
    return {"type":kind,"uuid":item.get("uuid"),"message":{"id":item.get("message",{}).get("id") or item.get("uuid"),"content":blocks},
            "__timestamp":item.get("timestamp") or now()}


def append_event(info, event):
    with open(info["output"], "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False)+"\n")
        f.flush()


def collect(root, info, listing):
    previous_offset=info.get("offset",0)
    hook = monitor.read(Path(info["hook_record"]))
    if hook.get("session_id"):
        info["session_id"] = hook["session_id"]
        info["execution_cwd"] = hook.get("cwd") or info["cwd"]
    path = hook.get("transcript_path") or info.get("transcript_path")
    if path:
        info["transcript_path"] = path
        try:
            with open(path, "rb") as stream:
                if os.fstat(stream.fileno()).st_size < info.get("offset", 0):
                    info.update(offset=0, turn_seen=False)
                stream.seek(info.get("offset", 0))
                while True:
                    line = stream.readline()
                    if not line or not line.endswith(b"\n"):
                        break
                    info["offset"] = stream.tell()
                    try:
                        item = json.loads(line)
                    except ValueError:
                        continue
                    content = (item.get("message") or {}).get("content")
                    user_text = content if isinstance(content, str) else monitor.public_content(content)
                    if item.get("type") == "user" and info["marker"] in user_text:
                        info["turn_seen"] = True
                        if info.pop("missing_turn",False):info.pop("error",None)
                    elif item.get("type") == "user" and "[Managed task turn " in user_text and info.get("turn_seen"):
                        info["turn_ended"] = True
                    if info.get("turn_ended"): break
                    if not info.get("turn_seen"):
                        continue
                    if item.get("isApiErrorMessage"):
                        info["error"] = monitor.public_content(content)
                        info["api_error"] = True
                    model = (item.get("message") or {}).get("model")
                    if model and model != "<synthetic>":
                        info["reported_model"] = model
                        append_event(info, {"type":"system","subtype":"init","model":model,"__timestamp":item.get("timestamp") or now()})
                    event = public_event(item)
                    if event:
                        append_event(info, event)
                        for b in event["message"]["content"]:
                            if b["type"] == "text": info["last_text"] = b["text"]
                            if b["type"] == "tool_result" and b["is_error"]:
                                info["tool_errors"] = info.get("tool_errors",0)+1
        except FileNotFoundError:
            pass
    if info.get("offset",0) != previous_offset:
        info["finalized"]=False
    job = job_for(info, listing)
    if job:
        info.pop("observation_error", None)
        info.update(session_id=job.get("sessionId") or info["session_id"], native_state=job.get("state"), waiting_for=job.get("waitingFor"), worker_pid=job.get("pid"))
        state = job.get("state")
        status = {"working":"running", "blocked":"blocked", "done":"completed", "failed":"failed", "stopped":"stopped"}.get(state,"unknown")
        # A resumed job can still advertise the previous turn's done state.
        if status == "completed" and not info.get("turn_seen"):
            if time.time()-info["started"] > 15:
                status="failed"
                info["missing_turn"]=True
                info["error"]="Native turn is done, but its SessionStart hook or current transcript turn is missing. Inspect with claude attach; do not replay blindly."
            else: status = "starting"
        info["status"] = status
        if info.get("resume_source") and info["session_id"] != info["resume_source"]:
            info["resume_note"] = "Claude resumed into a new conversation UUID. Its source session is recorded; verify context before acceptance."
    else:
        info.update(status="unknown", observation_error="Native task absent from inventory. Inspect its saved conversation before recovery.")
    if info["status"] in ("completed", "failed", "stopped") and not info.get("finalized"):
        terminal_status=info["status"]
        if info.get("terminal_offset") != info.get("offset",0) or info.get("terminal_status") != terminal_status:
            info.update(terminal_since=time.time(),terminal_offset=info.get("offset",0),terminal_status=terminal_status)
        if time.time()-info.get("terminal_since",time.time()) < 1:
            info["status"]="finishing"
            monitor.save(root/"runs"/(info["id"]+".json"),info)
            return info
        if info["status"] == "completed" and (info.get("api_error") or not info.get("last_text")):
            info["status"] = "failed"
            info.setdefault("error", "Native turn ended without a public response")
        append_event(info, {"type":"result","result":info.get("last_text", ""),
                           "subtype":"success" if info["status"] == "completed" else info["status"],
                           "errors":[info["error"]] if info.get("error") else [],
                           "modelUsage":{info["reported_model"]:{}} if info.get("reported_model") else {},"__timestamp":now()})
        info.update(finalized=True, finished=time.time())
    monitor.save(root/"runs"/(info["id"]+".json"), info)
    return info


def refresh(root, ident=None):
    with lock(root):
        records = [record(root,ident)] if ident else [monitor.read(p) for p in (root/"runs").glob("*.json")]
        records = [r for r in records if r]
        if not records: return []
        # Native transcript writes can arrive after the inventory's terminal state.
        # Keep reconciling growing logs without querying finished, unchanged jobs.
        for r in records:
            if r.get("finalized") and not r.get("turn_ended"):
                path=monitor.read(Path(r["hook_record"])).get("transcript_path") or r.get("transcript_path")
                if path and Path(path).exists() and Path(path).stat().st_size > r.get("offset",0):
                    r["finalized"]=False
        unfinished=[r for r in records if not r.get("finalized")]
        if not unfinished:return records
        listing = jobs(unfinished[0]["cli"])
        return [collect(root,r,listing) if not r.get("finalized") else r for r in records]


def launch(root, cwd, prompt, model, effort="high", tools="Read,Glob,Grep", mode="plan", title=None, previous=None, cli=None, allowed_tools=""):
    cli = cli or cli_path()
    cwd = str(Path(cwd).expanduser().resolve(strict=True))
    if not isinstance(prompt,str) or not isinstance(model,str) or not prompt.strip() or not model.strip(): raise RuntimeError("A nonempty brief and explicit model are required")
    with lock(root):
        if previous:
            old = record(root,previous)
            listing=jobs(cli)
            old=collect(root,old,listing)
            job=job_for(old,listing)
            if not job or job.get("state") not in ("done","stopped","failed") or job.get("status") == "busy":
                raise RuntimeError("Previous turn must be confirmed done or stopped; never resume a working or missing job")
            allowed_tools = old.get("allowed_tools", "")
            cwd, model, effort, tools, mode = old["cwd"],old["model"],old["effort"],old["tools"],old["permission_mode"]
            if not old.get("finalized"):
                raise RuntimeError("The stopped turn transcript is still settling; check status before resuming")
            lineage=old.get("conversation_id",old["id"])
            related=[r for r in (monitor.read(p) for p in (root/"runs").glob("*.json")) if r.get("conversation_id",r.get("id"))==lineage and r.get("dispatch_state")!="not_started"]
            if any(not r.get("finalized") for r in related):
                raise RuntimeError("This session already has an unfinished managed turn")
            if max(related,key=lambda r:r["started"])["id"] != previous:
                raise RuntimeError("Resume the latest managed turn to preserve conversation history")
        ident=secrets.token_hex(12); task=root/"tasks"/ident; task.mkdir(mode=0o700)
        marker=f"[Managed task turn {ident}]"
        hook_record=task/"native.json"
        settings={"autoMemoryEnabled":False,"env":{"CLAUDE_CODE_DISABLE_BG_EXIT_HANDOFF":"1"},"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":sys.executable,
                     "args":[str(HERE/"claude_code.py"),"_hook","--record",str(hook_record)],"timeout":10}]}]}}
        monitor.save(task/"settings.json",settings)
        (task/"brief.md").write_text(prompt);(task/"brief.md").chmod(0o600)
        output=task/"public.jsonl";output.touch(mode=0o600)
        info=dict(id=ident,session_id=old["session_id"] if previous else ident,job_id=None,title=title or (old["title"] if previous else "Claude Code task"),
                  conversation_id=old.get("conversation_id",old["id"]) if previous else ident,resume_source=old["session_id"] if previous else None,
                  profile="execute",model=model,effort=effort,tools=tools,allowed_tools=allowed_tools,permission_mode=mode,cwd=cwd,cli=cli,marker=marker,hook_record=str(hook_record),
                  output=str(output),started=time.time(),status="starting",resumed=bool(previous),offset=0,turn_seen=False)
        monitor.save(root/"runs"/(ident+".json"),info)
        args=["--bg","--name",f"cc-{ident}","--model",model,"--effort",effort,"--tools",tools,"--permission-mode",mode,
              "--settings",str(task/"settings.json"),"--strict-mcp-config","--mcp-config",'{"mcpServers":{}}']
        if allowed_tools: args += ["--allowedTools",allowed_tools]
        if previous: args += ["--resume",old["session_id"]]
        try:
            text=native(cli,args+["--",marker+"\n"+prompt],cwd)
            match=re.search(r"backgrounded\s*·\s*([0-9a-f]{8,})",text)
            if not match: raise RuntimeError("No native background ID returned; inspect the private dispatch log before trying again")
            info["job_id"]=match[1]
            monitor.save(task/"dispatch.json",{"output":text})
            monitor.save(root/"runs"/(ident+".json"),info)
            listing=jobs(cli)
            job=job_for(info,listing)
            if job and job.get("sessionId"): info["session_id"]=job["sessionId"]
            if previous and info["session_id"] != old["session_id"]: info["resume_note"]="Claude created a new conversation UUID from the recorded source session; verify context before accepting."
            if previous and re.search(r"\bnote:",text,re.I):
                info["resume_note"]="Claude created a copy; verify the returned session identity before accepting it."
            monitor.save(root/"runs"/(ident+".json"),info)
        except Exception as exc:
            inventory_checked=False
            if not info.get("job_id"):
                try:
                    job_for(info,jobs(cli))
                    inventory_checked=True
                except Exception: pass
            if info.get("job_id"):
                info.update(status="unknown",observation_error=str(exc))
                monitor.save(root/"runs"/(ident+".json"),info)
                return info
            if isinstance(exc,(FileNotFoundError,PermissionError)) or (isinstance(exc,NativeRejected) and inventory_checked):
                info.update(status="failed",error=str(exc),finalized=True,finished=time.time(),dispatch_state="not_started")
            else:
                info.update(status="unknown",observation_error=str(exc),dispatch_state="unconfirmed")
            monitor.save(root/"runs"/(ident+".json"),info)
            raise
    return info


def stop(root, ident):
    with lock(root):
        info=record(root,ident); listing=jobs(info["cli"]); job=job_for(info,listing)
        if not job: raise RuntimeError("Native job missing; refusing an unverified stop")
        if job.get("state") not in ("stopped","done","failed"):
            native(info["cli"],["stop",info["job_id"]])
        for _ in range(40):
            listing=jobs(info["cli"]); job=job_for(info,listing)
            if job and job.get("state") in ("stopped","done","failed") and job.get("status") != "busy":
                info=collect(root,info,listing)
                if info.get("finalized"): return info
            time.sleep(.25)
        raise RuntimeError("Stop not confirmed yet; do not resume until native state settles")


def setup_monitor():
    monitor.ACTIVE=ACTIVE
    monitor.run_info=lambda path: monitor.read(path)
    # Native tasks survive this observer; never infer task death from server PID.


class Handler(monitor.Handler):
    def do_POST(self):
        expected=f"127.0.0.1:{self.server.server_port}"
        if self.headers.get("Host") != expected or self.headers.get("Origin") != "http://"+expected or self.headers.get("Content-Type") != "application/json":
            self.send_error(403);return
        prefix="/"+self.server.token+"/control/"
        path=urlsplit(self.path).path
        if not path.startswith(prefix): self.send_error(404);return
        ident=path[len(prefix):]
        try:
            size=int(self.headers.get("Content-Length","0"))
            if size<=0 or size>65536: self.send_error(413);return
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict): raise RuntimeError("Expected a JSON object")
            action=body.get("action")
            info=record(self.server.root,ident)
            if action=="stop": result=stop(self.server.root,ident)
            elif action=="resume":
                result=launch(self.server.root,info["cwd"],body.get("prompt", ""),info["model"],previous=ident,cli=info["cli"])
            else: raise RuntimeError("Unknown action")
            self.reply({"run":result})
        except (RuntimeError,ValueError,TypeError,subprocess.SubprocessError) as exc:
            self.send_response(409);self.response_headers("application/json; charset=utf-8");self.end_headers()
            self.wfile.write(json.dumps({"error":str(exc)}).encode())

    def do_GET(self):
        route=urlsplit(self.path).path
        if route == "/"+self.server.token+"/controls.js":
            if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}": self.send_error(403);return
            self.reply((monitor.ASSETS/"controls.js").read_bytes(),"text/javascript; charset=utf-8");return
        super().do_GET()


def serve(root):
    setup_monitor()
    monitor.Handler=Handler
    def poll():
        while True:
            try: refresh(root)
            except Exception: pass # A transient inventory failure is not task completion.
            time.sleep(1)
    threading.Thread(target=poll,daemon=True).start()
    monitor.serve(root)


def panel(root):
    # Reuse the same dashboard server/projection; bootstrap this native adapter.
    with (root/"start.lock").open("a") as file:
        fcntl.flock(file,fcntl.LOCK_EX)
        info=monitor.server_info(root)
        if not info:
            p=subprocess.Popen([sys.executable,str(HERE/"claude_code.py"),"_serve","--state-dir",str(root)],stdin=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
            for _ in range(100):
                info=monitor.server_info(root)
                if info: break
                if p.poll() is not None: raise RuntimeError("Panel failed to start")
                time.sleep(.05)
            if not info: p.terminate();raise RuntimeError("Panel startup timed out")
        return f"http://127.0.0.1:{info['port']}/{info['token']}/"


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest="action",required=True)
    for name in ("doctor","list","monitor","_serve"):
        s=sub.add_parser(name);s.add_argument("--state-dir")
    for name in ("run","resume"):
        s=sub.add_parser(name);s.add_argument("--state-dir");s.add_argument("--prompt-file",required=True);s.add_argument("--title")
        if name=="run":
            s.add_argument("--cwd",required=True);s.add_argument("--model",required=True);s.add_argument("--effort",default="high",choices=["low","medium","high","xhigh","max"])
            s.add_argument("--tools",default="Read,Glob,Grep");s.add_argument("--allowed-tools",default="");s.add_argument("--permission-mode",default="plan",choices=["plan","acceptEdits","dontAsk","manual","auto"])
        else:s.add_argument("id")
    for name in ("status","stop","logs","result","attach"):
        s=sub.add_parser(name);s.add_argument("id");s.add_argument("--state-dir")
    s=sub.add_parser("_hook");s.add_argument("--record",required=True)
    a=p.parse_args(argv)
    if a.action=="_hook":
        d=json.load(sys.stdin);monitor.save(Path(a.record),{k:d[k] for k in ("session_id","transcript_path","cwd","model") if k in d});return 0
    root=root_dir(a.state_dir)
    if a.action=="_serve":serve(root);return 0
    if a.action=="doctor":
        cli=cli_path();auth=json.loads(native(cli,["auth","status"]));result={"cli":cli,"version":native(cli,["--version"]).strip(),"logged_in":bool(auth.get("loggedIn")),"state_dir":str(root),"native_background": "--bg" in native(cli,["--help"])}
    elif a.action in ("run","resume"):
        if a.action=="run":info=launch(root,a.cwd,Path(a.prompt_file).read_text(),a.model,a.effort,a.tools,a.permission_mode,a.title,allowed_tools=a.allowed_tools)
        else:
            old=record(root,a.id);info=launch(root,old["cwd"],Path(a.prompt_file).read_text(),old["model"],title=a.title,previous=a.id,cli=old["cli"])
        result={**info,"monitor_url":panel(root)+"#"+info["id"]}
    elif a.action=="monitor":result={"monitor_url":panel(root)}
    elif a.action=="list":result=refresh(root)
    elif a.action=="stop":result=stop(root,a.id)
    elif a.action in ("status","result","logs"):
        result=refresh(root,a.id)[0]
        if a.action=="logs":
            tail=monitor.Tail(result["output"]);tail.poll();result=tail.projection.snapshot()
        if a.action=="result":
            result["model_matches"]=result.get("reported_model")==result["model"]
            result["requires_parent_review"]=True
            print(json.dumps(result,ensure_ascii=False,indent=2));return 0 if result["status"]=="completed" and result.get("last_text") and result.get("reported_model")==result["model"] and not result.get("tool_errors") else 1
    elif a.action=="attach":
        info=record(root,a.id);return subprocess.call([info["cli"],"attach",info["job_id"]])
    print(json.dumps(result,ensure_ascii=False,indent=2));return 0


if __name__=="__main__":
    try:sys.exit(main())
    except (RuntimeError,OSError,ValueError,subprocess.SubprocessError) as exc:
        print(json.dumps({"error":str(exc)}),file=sys.stderr);sys.exit(1)
