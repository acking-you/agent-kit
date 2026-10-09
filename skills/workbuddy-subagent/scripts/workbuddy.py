#!/usr/bin/env python3
"""Route tasks to WorkBuddy's bundled CLI; persist conversations in the native CLI."""
import argparse
import json
import os
from pathlib import Path
import plistlib
from collections import deque
import re
import selectors
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid


class WorkBuddyError(Exception):
    pass


def runtime():
    app = Path(os.environ.get("WORKBUDDY_HOME", "/Applications/WorkBuddy.app")).expanduser()
    cli = Path(os.environ.get("WORKBUDDY_CLI_PATH", str(
        app / "Contents/Resources/app.asar.unpacked/cli/bin/codebuddy"))).expanduser()
    node = os.environ.get("WORKBUDDY_NODE") or shutil.which("node")
    data = Path(os.environ.get("WORKBUDDY_DATA_DIR", str(Path.home() / ".workbuddy"))).expanduser()
    product = Path(os.environ.get("ACC_PRODUCT_CONFIG_PATH", str(
        data / "cache/acc-product-config-v3.json"))).expanduser()
    if not node or not cli.is_file():
        raise WorkBuddyError("Bundled CLI or Node.js missing; set WORKBUDDY_HOME, WORKBUDDY_CLI_PATH or WORKBUDDY_NODE.")
    if not product.is_file():
        raise WorkBuddyError("WorkBuddy product config missing. Open and sign in to the desktop app first.")
    env = os.environ.copy()
    env.update(CODEBUDDY_CONFIG_DIR=str(data), WORKBUDDY_CONFIG_DIR=str(data),
               ACC_PRODUCT_CONFIG_PATH=str(product), CODEBUDDY_HOST="workbuddy-desktop",
               CODEBUDDY_FORCE_HEADLESS_BUNDLE="1",
               CLIENT_INFO_PLATFORM="WorkBuddy", CLIENT_INFO_IDE_TYPE="WorkBuddy",
               CLIENT_INFO_PRODUCT_NAME="WorkBuddy", CLIENT_INFO_PLUGIN_NAME="workbuddy-desktop")
    network = json.loads(product.read_text()).get("networkEnvironment")
    if isinstance(network, str) and re.fullmatch(r"[A-Za-z0-9_-]+", network):
        env["CODEBUDDY_INTERNET_ENVIRONMENT"] = network
    version = None
    info = app / "Contents/Info.plist"
    if info.is_file():
        with info.open("rb") as stream:
            version = plistlib.load(stream).get("CFBundleShortVersionString")
        if version:
            env["CLIENT_INFO_PRODUCT_VERSION"] = version
            env["CLIENT_INFO_PLUGIN_VERSION"] = version
    env["PATH"] = str(Path(node).parent) + os.pathsep + env.get("PATH", "")
    consent_file = Path(__file__).resolve().parents[1] / "user-config.json"
    consent = json.loads(consent_file.read_text()) if consent_file.is_file() else {}
    native = os.environ.get("WORKBUDDY_NATIVE_BOOTSTRAP") == "1" or consent.get("native_bootstrap_consent") is True
    command = [node, str(cli)]
    if native:
        if sys.platform != "darwin":
            raise WorkBuddyError("Native bootstrap has only been validated on macOS.")
        with info.open("rb") as stream:
            executable = plistlib.load(stream)["CFBundleExecutable"]
        electron = app / "Contents/MacOS" / executable
        command = [str(electron), str(Path(__file__).with_name("native-bootstrap.cjs")), node, str(cli)]
        env.update(ELECTRON_RUN_AS_NODE="1", WORKBUDDY_NATIVE_BOOTSTRAP="1",
                   WORKBUDDY_HOME=str(app), WORKBUDDY_DATA_DIR=str(data))
    return command, env, {"cli": str(cli), "node": node, "native_bootstrap_enabled": native,
        "app_version": version, "data_dir": str(data), "product_config_found": True}


def isolated_flags():
    # Authentication still comes from WorkBuddy; task hooks/MCP settings are opt-in.
    return ["--setting-sources", "user", "--settings", '{"disableAllHooks":true}',
            "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}']


def stop_process_group(proc, grace=5):
    """Terminate the group we launched, including children retaining stdout."""
    def send(sig):
        try:
            os.killpg(proc.pid, sig)
        except ProcessLookupError:
            pass
    send(signal.SIGTERM)
    try:
        proc.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        pass
    finally:
        send(signal.SIGKILL)
    proc.wait()


def interrupted(signum, frame):
    raise KeyboardInterrupt


def catalog(command, env, cwd, timeout=45):
    """Use native ACP only to enumerate models; never scrape tokens or send a prompt."""
    proc = subprocess.Popen(command + ["--acp", "--permission-mode", "plan", "--tools", ""]
                            + isolated_flags(), cwd=cwd, env=env, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    messages = deque()
    pending = b""
    deadline = time.monotonic() + timeout
    previous = signal.signal(signal.SIGTERM, interrupted) if threading.current_thread() is threading.main_thread() else None
    def rpc(ident, method, params):
        nonlocal pending
        proc.stdin.write((json.dumps({"jsonrpc": "2.0", "id": ident,
                                    "method": method, "params": params}) + "\n").encode())
        proc.stdin.flush()
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise WorkBuddyError("Model catalog timed out; check WorkBuddy login and connectivity.")
            if not messages:
                if not selector.select(remaining):
                    raise WorkBuddyError("Model catalog timed out; check WorkBuddy login and connectivity.")
                chunk = os.read(proc.stdout.fileno(), 65536)
                if not chunk:
                    raise WorkBuddyError("CLI exited before returning its model catalog.")
                pending += chunk
                while b"\n" in pending:
                    line, _, pending = pending.partition(b"\n")
                    try:
                        message = json.loads(line)
                        if isinstance(message, dict):
                            messages.append(message)
                    except ValueError:
                        pass
                continue
            message = messages.popleft()
            if message.get("method") and "id" in message:
                proc.stdin.write((json.dumps({"jsonrpc": "2.0", "id": message["id"],
                    "error": {"code": -32601, "message": "Catalog client does not execute tools"}}) + "\n").encode())
                proc.stdin.flush()
            if message.get("id") == ident and "method" not in message:
                if "error" in message:
                    raise WorkBuddyError("ACP catalog request failed; check the desktop login.")
                return message.get("result", {})
    try:
        rpc(1, "initialize", {"protocolVersion": 1, "clientCapabilities": {},
                              "clientInfo": {"name": "workbuddy-skill", "version": "1.0"}})
        result = rpc(2, "session/new", {"cwd": str(cwd), "mcpServers": []})
        models = result.get("models", {}).get("availableModels", [])
        ids = [item["modelId"] for item in models if isinstance(item.get("modelId"), str)]
        if not ids:
            raise WorkBuddyError("CLI returned no model IDs; update WorkBuddy or sign in again.")
        return ids
    finally:
        selector.close()
        try:
            stop_process_group(proc)
        finally:
            proc.stdin.close()
            proc.stdout.close()
            if previous is not None:
                signal.signal(signal.SIGTERM, previous)


def select_model(ids, requested):
    # Capability cannot be inferred from a permanent brand suffix or version sort.
    # The parent resolves the current provider flagship using docs + this catalog.
    if not requested or requested in ("frontier", "gpt", "claude", "auto"):
        raise WorkBuddyError("Pass --model EXACT_ID after checking current vendor guidance and the WorkBuddy catalog; family aliases do not identify the strongest model.")
    if requested not in ids:
        raise WorkBuddyError(f"Requested model is absent from the local catalog: {requested}")
    return requested


def json_values(text):
    """Native logs can interleave pretty JSON, NDJSON and terminal messages."""
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    decoder = json.JSONDecoder()
    opening = re.compile(r"[\[{]")
    pos = 0
    while pos < len(text):
        match = opening.search(text, pos)
        if not match:
            break
        pos = match.start()
        try:
            value, end = decoder.raw_decode(text, pos)
            yield value
            pos = end
        except ValueError:
            pos += 1


def checked_result(text, expected_model=None):
    result = None
    init_models = set()
    for event in json_values(text):
        if not isinstance(event, dict):
            continue
        if event.get("type") == "result":
            result = event
        elif event.get("type") == "system" and event.get("subtype") == "init" and event.get("model"):
            init_models.add(event["model"])
    if result is None:
        raise WorkBuddyError("No final JSON result yet. A started/idle/exited job is not proof of success; inspect jobs/logs.")
    meta_error = result.get("_meta", {}).get("codebuddy.ai/errorMessage")
    ok = (result.get("subtype") == "success" and result.get("is_error") is False
          and not result.get("errors") and not meta_error
          and not result.get("permission_denials")
          and bool(result.get("result", "").strip() or result.get("structured_output")))
    reported = set(result.get("modelUsage", {})) or init_models
    if ok and expected_model and reported != {expected_model}:
        raise WorkBuddyError("Reported model differs from the requested model or is missing; inspect the saved transcript.")
    value = {key: result[key] for key in ("session_id", "result", "subtype", "is_error",
            "errors", "structured_output", "permission_denials", "num_turns") if key in result}
    value["reported_models"] = sorted(reported)
    return value, ok


def emit(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def invoke(command, env, cwd, args, timeout=60):
    try:
        return subprocess.run(command + args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                              capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise WorkBuddyError("CLI timed out; check the saved session before retrying.")


def run_task(command, env, cwd, flags, output, timeout, stop_grace=5):
    # Reserve output before making a model request. Never replay a task because a log exists.
    stream = None
    if output:
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        stream = os.fdopen(fd, "w", encoding="utf-8")
    proc = None
    timer = None
    timed_out = threading.Event()
    drained = False
    text = []
    try:
        proc = subprocess.Popen(command + flags, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=True)
        def stop_tree():
            stop_process_group(proc, stop_grace)
        def expire():
            timed_out.set()
            stop_tree()
        if timeout:
            timer = threading.Timer(timeout, expire)
            timer.daemon = True
            timer.start()
        for line in proc.stdout:
            if stream:
                stream.write(line)
                stream.flush()
            text.append(line)
        code = proc.wait()
        drained = True
        if timed_out.is_set():
            raise WorkBuddyError("Task timed out; its transcript is preserved. Resume explicitly after checking side effects.")
        return code, "".join(text)
    finally:
        if timer:
            timer.cancel()
        if proc:
            if not drained or proc.poll() is None:
                stop_tree()
                proc.wait()
            proc.stdout.close()
        if stream:
            stream.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    models = sub.add_parser("models")
    models.add_argument("--cwd", default=os.getcwd())
    run = sub.add_parser("run")
    run.add_argument("--cwd", required=True)
    run.add_argument("--prompt-file", required=True, help="UTF-8 file; '-' reads stdin")
    run.add_argument("--model", required=True, help="Exact WorkBuddy ID resolved from current vendor guidance and catalog; required on every turn")
    run.add_argument("--profile", choices=["review", "execute", "design", "writing", "brainstorm"],
                     default="execute", help="Task intent: design/writing/brainstorm prefer Claude; review/execute prefer GPT. --model controls execution.")
    run.add_argument("--resume", help="Explicit session ID; never use ambiguous --continue")
    run.add_argument("--permission-mode", choices=["plan", "dontAsk", "acceptEdits"], default="plan")
    run.add_argument("--tools", default="Read,Glob,Grep", help="Empty disables tools; default is read-only")
    run.add_argument("--effort", choices=["low", "medium", "high", "xhigh", "max"], default="high")
    run.add_argument("--max-turns", type=int, default=20)
    run.add_argument("--timeout", type=int, default=0, help="Seconds; 0 waits until completion (use host execution sessions)")
    run.add_argument("--output", help="Stream native output into a NEW private local file")
    run.add_argument("--title", help="Short title shown in the local monitoring panel")
    run.add_argument("--no-monitor", action="store_true", help="Disable dashboard registration and automatic server startup")
    monitor_cli = sub.add_parser("monitor", help="Manage the independent read-only local dashboard")
    monitor_cli.add_argument("action", choices=["start", "status", "stop", "serve"], nargs="?", default="start")
    monitor_cli.add_argument("--state-dir")
    result = sub.add_parser("result")
    result.add_argument("log", help="Native JSON output or background log path")
    cli = sub.add_parser("cli", help="Native job commands, using WorkBuddy's environment")
    cli.add_argument("args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.command == "monitor":
        import monitor
        return monitor.main([args.action] + (["--state-dir", args.state_dir] if args.state_dir else []))
    if args.command == "result":
        value, ok = checked_result(Path(args.log).read_text(errors="replace"))
        emit(value)
        return 0 if ok else 1
    command, env, info = runtime()
    if args.command == "doctor":
        emit(info)
        return 0
    if args.command == "cli":
        if not args.args or args.args[0] not in ("ps", "logs", "stop", "attach", "respawn"):
            raise WorkBuddyError("cli supports ps, logs, stop, attach, respawn only.")
        return subprocess.call(command + args.args, env=env)
    cwd = Path(args.cwd).expanduser().resolve(strict=True)
    if args.command == "models":
        ids = catalog(command, env, cwd)
        emit({"models": ids,
              "note": "This catalog is unranked. Resolve the current strongest Claude/GPT using vendor guidance, then pass its exact ID. Catalog presence does not verify inference access."})
        return 0
    prompt = sys.stdin.read() if args.prompt_file == "-" else Path(args.prompt_file).read_text()
    if not prompt.strip() or args.max_turns < 1 or args.timeout < 0:
        raise WorkBuddyError("Provide a nonempty prompt, a positive turn limit and a nonnegative timeout.")
    if args.output and Path(args.output).exists():
        raise WorkBuddyError("Output already exists; choose a new path before starting this task.")
    model = select_model(catalog(command, env, cwd), args.model)
    session = args.resume or str(uuid.uuid4())
    record = None
    monitor_url = None
    if not args.no_monitor:
        import monitor
        root = monitor.state_dir()
        monitor_url = monitor.ensure_server(root)
        args.output = str(Path(args.output).expanduser().resolve()) if args.output else str(root / "runs" / (uuid.uuid4().hex + ".jsonl"))
        record = monitor.RunRecord(root, session_id=session, model=model, profile=args.profile,
                                   cwd=str(cwd), output=args.output, title=args.title or f"{args.profile.title()} with {model}",
                                   resumed=bool(args.resume))
        monitor_url += "#" + record.id
    flags = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
             "--permission-mode", args.permission_mode, "--tools", args.tools,
             "--effort", args.effort, "--max-turns", str(args.max_turns)] + isolated_flags()
    flags += ["--model", model]
    flags += ["--resume" if args.resume else "--session-id", session]
    # End option parsing: prompt files may contain leading dashes or shell syntax.
    flags += ["--", prompt]
    emit({"session_id": session, "model": model,
          "profile": args.profile, "cwd": str(cwd), "output": args.output, "monitor_url": monitor_url})
    sys.stdout.flush()
    previous = signal.signal(signal.SIGTERM, interrupted)
    try:
        if record:
            record.update(status="running")
        code, stdout = run_task(command, env, cwd, flags, args.output, args.timeout)
        result, ok = checked_result(stdout, expected_model=model)
        if record:
            record.finish("completed" if not code and ok else "failed", exit_code=code,
                          error=None if not code and ok else "CLI result validation failed. Inspect the final result and transcript.")
    except BaseException as error:
        if record:
            record.finish("interrupted" if isinstance(error, KeyboardInterrupt) else "failed", error=str(error) or "Task interrupted.")
        raise
    finally:
        signal.signal(signal.SIGTERM, previous)
    emit(result)
    if code or not ok:
        print("WorkBuddy task failed or is incomplete. For auth errors, first check desktop login. If desktop works, this CLI may lack its credential bootstrap; see references/compatibility.md. Do not silently change models.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (WorkBuddyError, OSError, ValueError, RuntimeError) as error:
        print(f"workbuddy: {error}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("workbuddy: Task interrupted; transcript preserved.", file=sys.stderr)
        sys.exit(130)
