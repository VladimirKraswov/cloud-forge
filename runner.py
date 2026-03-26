#!/usr/bin/env python3
"""
Cloud Forge Runner v4
- получает run-config по share token
- создаёт workspace
- скачивает attached files
- запускает код
- шлёт heartbeat
- стримит логи
- загружает артефакты из /workspace/artifacts
- завершает run через run_id
"""

import json
import mimetypes
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

print("🚀 Cloud-Forge Runner v4 starting...")

try:
    import requests
except ImportError:
    print("📦 Installing requests...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "requests"])
    import requests


JOB_CONFIG_URL = os.getenv("JOB_CONFIG_URL")
RUN_TIMEOUT_SECONDS = int(os.getenv("RUN_TIMEOUT_SECONDS", "600"))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("CLOUD_FORGE_HEARTBEAT_INTERVAL_SECONDS", "10"))

if not JOB_CONFIG_URL:
    print("❌ JOB_CONFIG_URL environment variable is required")
    sys.exit(1)

parsed_job_url = urlsplit(JOB_CONFIG_URL)
SERVER_URL = os.getenv("SERVER_URL") or f"{parsed_job_url.scheme}://{parsed_job_url.netloc}"

HOSTNAME = socket.gethostname()
WORKER_ID = os.getenv("CLOUD_FORGE_WORKER_ID") or f"worker-{HOSTNAME}"
WORKER_NAME = os.getenv("CLOUD_FORGE_WORKER_NAME") or WORKER_ID
WORKER_HOST = os.getenv("CLOUD_FORGE_WORKER_HOST") or HOSTNAME

print(f"📡 Fetching run config from {JOB_CONFIG_URL}")


def load_capabilities():
    raw = os.getenv("CLOUD_FORGE_WORKER_CAPABILITIES")
    if not raw:
        return {
            "hostname": HOSTNAME,
            "platform": sys.platform,
            "python_version": sys.version.split()[0],
        }

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
        return {"raw_capabilities": parsed}
    except Exception:
        return {"raw_capabilities": raw}


WORKER_CAPABILITIES = load_capabilities()


def post_json(path: str, payload: dict, timeout: int = 10, raise_errors: bool = False):
    url = urljoin(SERVER_URL, path)
    try:
        response = requests.post(url, json=payload, timeout=timeout)
        if raise_errors:
            response.raise_for_status()
        return response
    except Exception as exc:
        if raise_errors:
            raise
        print(f"⚠️ POST {url} failed: {exc}")
        return None


def safe_log(run_id: str, message: str, level: str = "info"):
    print(message)
    post_json(
        "/api/runs/logs",
        {
            "run_id": run_id,
            "message": message,
            "level": level,
        },
        timeout=5,
        raise_errors=False,
    )


def download_file(url: str, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with open(destination, "wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 128):
                if chunk:
                    output.write(chunk)


def upload_run_artifact(run_id: str, server_url: str, local_path: Path, relative_path: str):
    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    with open(local_path, "rb") as file_handle:
        response = requests.post(
            urljoin(server_url, f"/artifacts/upload-run?runId={run_id}&relativePath={relative_path}"),
            files={"file": (local_path.name, file_handle, content_type)},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()


def upload_artifacts_directory(run_id: str, artifacts_dir: Path):
    if not artifacts_dir.exists() or not artifacts_dir.is_dir():
        safe_log(run_id, f"📦 Artifacts directory does not exist: {artifacts_dir}")
        return {
            "uploaded_count": 0,
            "uploaded_files": [],
        }

    files_to_upload = [path for path in artifacts_dir.rglob("*") if path.is_file()]

    if not files_to_upload:
        safe_log(run_id, "📦 No artifacts found to upload")
        return {
            "uploaded_count": 0,
            "uploaded_files": [],
        }

    uploaded_files = []

    for local_path in files_to_upload:
        relative_path = local_path.relative_to(artifacts_dir).as_posix()
        safe_log(run_id, f"⬆️ Uploading artifact: {relative_path}")

        try:
            result = upload_run_artifact(run_id, SERVER_URL, local_path, relative_path)
            uploaded_files.append(result)
        except Exception as exc:
            safe_log(run_id, f"❌ Failed to upload artifact {relative_path}: {exc}", "error")

    safe_log(run_id, f"📦 Uploaded artifacts: {len(uploaded_files)}")

    return {
        "uploaded_count": len(uploaded_files),
        "uploaded_files": uploaded_files,
    }


try:
    response = requests.get(JOB_CONFIG_URL, timeout=20)
    response.raise_for_status()
    payload = response.json()
except Exception as exc:
    print(f"❌ Failed to fetch run config: {exc}")
    sys.exit(1)

run_id = payload.get("run_id")
job_id = payload.get("job_id")
config = payload.get("config") or {}

if not run_id or not job_id:
    print("❌ Invalid run config: missing run_id or job_id")
    sys.exit(1)

workspace = config.get("workspace") or {}
workspace_root = Path(workspace.get("root", "/workspace"))
code_dir = Path(workspace.get("code_dir", str(workspace_root / "code")))
input_dir = Path(workspace.get("input_dir", str(workspace_root / "input")))
output_dir = Path(workspace.get("output_dir", str(workspace_root / "output")))
artifacts_dir = Path(workspace.get("artifacts_dir", str(workspace_root / "artifacts")))
tmp_dir = Path(workspace.get("tmp_dir", str(workspace_root / "tmp")))

for directory in [workspace_root, code_dir, input_dir, output_dir, artifacts_dir, tmp_dir]:
    directory.mkdir(parents=True, exist_ok=True)

safe_log(run_id, f"✅ Run claimed: {run_id}")
safe_log(run_id, f"📁 Workspace root: {workspace_root}")

environments = config.get("environments") or {}
for key, value in environments.items():
    os.environ[str(key)] = str(value)

os.environ["CLOUD_FORGE_RUN_ID"] = run_id
os.environ["CLOUD_FORGE_JOB_ID"] = job_id
os.environ["CLOUD_FORGE_WORKER_ID"] = WORKER_ID
os.environ["CLOUD_FORGE_WORKER_NAME"] = WORKER_NAME
os.environ["CLOUD_FORGE_WORKER_HOST"] = WORKER_HOST
os.environ["CLOUD_FORGE_WORKSPACE_ROOT"] = str(workspace_root)
os.environ["CLOUD_FORGE_CODE_DIR"] = str(code_dir)
os.environ["CLOUD_FORGE_INPUT_DIR"] = str(input_dir)
os.environ["CLOUD_FORGE_OUTPUT_DIR"] = str(output_dir)
os.environ["CLOUD_FORGE_ARTIFACTS_DIR"] = str(artifacts_dir)
os.environ["CLOUD_FORGE_TMP_DIR"] = str(tmp_dir)
os.environ["CLOUD_FORGE_SERVER_URL"] = SERVER_URL

attached_files = config.get("attached_files") or []
for file_info in attached_files:
    filename = file_info.get("filename")
    mount_path = file_info.get("mount_path")
    download_path = file_info.get("download_path")

    if not filename or not mount_path or not download_path:
        continue

    absolute_url = urljoin(SERVER_URL, download_path)
    destination = Path(mount_path)

    safe_log(run_id, f"⬇️ Downloading attached file: {filename}")
    try:
        download_file(absolute_url, destination)
    except Exception as exc:
        safe_log(run_id, f"❌ Failed to download {filename}: {exc}", "error")
        post_json(
            "/api/runs/finish",
            {
                "run_id": run_id,
                "status": "failed",
                "result": f"Failed to download attached file: {filename}",
            },
            timeout=10,
            raise_errors=False,
        )
        sys.exit(1)

execution_language = config.get("execution_language", "python")
execution_code = config.get("execution_code", "")
entrypoint = config.get("entrypoint")

if not execution_code and not entrypoint:
    safe_log(run_id, "❌ No execution_code or entrypoint provided", "error")
    post_json(
        "/api/runs/finish",
        {
            "run_id": run_id,
            "status": "failed",
            "result": "No execution_code or entrypoint provided",
        },
        timeout=10,
        raise_errors=False,
    )
    sys.exit(1)

if execution_language == "javascript":
    code_file = code_dir / "main.js"
else:
    code_file = code_dir / "main.py"

if execution_code:
    code_file.write_text(execution_code, encoding="utf-8")
    safe_log(run_id, f"📄 Execution code saved to {code_file}")

post_json(
    "/api/runs/start",
    {
        "run_id": run_id,
        "worker_id": WORKER_ID,
        "worker_name": WORKER_NAME,
        "worker_host": WORKER_HOST,
        "capabilities": WORKER_CAPABILITIES,
    },
    timeout=10,
    raise_errors=False,
)

heartbeat_stop_event = threading.Event()


def heartbeat_loop():
    while not heartbeat_stop_event.is_set():
        post_json(
            "/api/runs/heartbeat",
            {
                "run_id": run_id,
                "worker_id": WORKER_ID,
                "worker_name": WORKER_NAME,
                "worker_host": WORKER_HOST,
                "capabilities": WORKER_CAPABILITIES,
            },
            timeout=5,
            raise_errors=False,
        )
        heartbeat_stop_event.wait(HEARTBEAT_INTERVAL_SECONDS)


heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
heartbeat_thread.start()

if entrypoint:
    command = ["/bin/sh", "-lc", entrypoint]
elif execution_language == "javascript":
    command = ["node", str(code_file)]
else:
    command = [sys.executable, str(code_file)]

safe_log(run_id, f"⚙️ Starting process: {' '.join(command)}")

process = None
stdout_thread = None
stderr_thread = None
timed_out = False


def pump_stream(stream, level: str):
    try:
        for raw_line in iter(stream.readline, ""):
            line = raw_line.rstrip("\n")
            if line:
                safe_log(run_id, line, level)
    finally:
        try:
            stream.close()
        except Exception:
            pass


try:
    process = subprocess.Popen(
        command,
        cwd=str(workspace_root),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=os.environ.copy(),
    )

    stdout_thread = threading.Thread(target=pump_stream, args=(process.stdout, "info"), daemon=True)
    stderr_thread = threading.Thread(target=pump_stream, args=(process.stderr, "error"), daemon=True)
    stdout_thread.start()
    stderr_thread.start()

    process.wait(timeout=RUN_TIMEOUT_SECONDS)

except subprocess.TimeoutExpired:
    timed_out = True
    safe_log(run_id, "⏰ Execution timed out", "error")
    if process:
        try:
            process.kill()
        except Exception:
            pass
except Exception as exc:
    safe_log(run_id, f"❌ Error during execution: {exc}", "error")
    if process:
        try:
            process.kill()
        except Exception:
            pass

if stdout_thread:
    stdout_thread.join(timeout=5)
if stderr_thread:
    stderr_thread.join(timeout=5)

heartbeat_stop_event.set()
heartbeat_thread.join(timeout=2)

artifact_upload_summary = upload_artifacts_directory(run_id, artifacts_dir)

if timed_out:
    final_status = "failed"
    final_result = f"Execution timed out after {RUN_TIMEOUT_SECONDS} seconds"
    exit_code = None
elif process is None:
    final_status = "failed"
    final_result = "Process did not start"
    exit_code = None
else:
    exit_code = process.returncode
    final_status = "finished" if exit_code == 0 else "failed"
    final_result = f"Process exited with code {exit_code}"

metrics = {
    "execution_language": execution_language,
    "timeout_seconds": RUN_TIMEOUT_SECONDS,
    "exit_code": exit_code,
    "workspace_root": str(workspace_root),
    "worker_id": WORKER_ID,
    "worker_name": WORKER_NAME,
    "artifact_upload": artifact_upload_summary,
}

post_json(
    "/api/runs/finish",
    {
        "run_id": run_id,
        "status": final_status,
        "result": final_result,
        "metrics": metrics,
    },
    timeout=15,
    raise_errors=False,
)

print(f"🏁 Run {run_id} finished with status: {final_status}")