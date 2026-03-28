#!/usr/bin/env python3
"""
Cloud Forge Runner v9
Hybrid architecture:
- control-plane: WebSocket
- data-plane: REST (download files, upload artifacts)

Highlights:
- structured colored local logs
- compact WS logging with optional debug mode
- clean shutdown logging
- better readable phases and sections
"""

import hashlib
import json
import mimetypes
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import parse_qs, urljoin, urlsplit


# -----------------------------------------------------------------------------
# Console formatting
# -----------------------------------------------------------------------------

class ANSI:
    RESET = "\033[0m"
    DIM = "\033[2m"
    BOLD = "\033[1m"

    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"

    BRIGHT_BLACK = "\033[90m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"


USE_COLOR = sys.stdout.isatty() and not os.getenv("NO_COLOR") and os.getenv("TERM") != "dumb"
DEBUG_WS = os.getenv("CLOUD_FORGE_DEBUG_WS", "").strip().lower() in {"1", "true", "yes", "on"}

LEVEL_STYLES = {
    "debug": {"color": ANSI.BRIGHT_BLACK, "label": "DEBUG", "icon": "·"},
    "info": {"color": ANSI.BRIGHT_BLUE, "label": "INFO ", "icon": "ℹ"},
    "success": {"color": ANSI.BRIGHT_GREEN, "label": "OK   ", "icon": "✓"},
    "warn": {"color": ANSI.BRIGHT_YELLOW, "label": "WARN ", "icon": "⚠"},
    "error": {"color": ANSI.BRIGHT_RED, "label": "ERR  ", "icon": "✖"},
    "step": {"color": ANSI.BRIGHT_CYAN, "label": "STEP ", "icon": "→"},
}


def colorize(text: str, color: str, bold: bool = False, dim: bool = False) -> str:
    if not USE_COLOR:
        return text
    prefix = ""
    if bold:
        prefix += ANSI.BOLD
    if dim:
        prefix += ANSI.DIM
    prefix += color
    return f"{prefix}{text}{ANSI.RESET}"


def now_local_hms() -> str:
    return time.strftime("%H:%M:%S", time.localtime())


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def compact(value: Any, max_len: int = 220) -> str:
    try:
        if isinstance(value, (dict, list, tuple)):
            text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        else:
            text = str(value)
    except Exception:
        text = repr(value)

    text = text.replace("\n", "\\n")
    if len(text) > max_len:
        return text[: max_len - 1] + "…"
    return text


def format_fields(fields: dict[str, Any]) -> str:
    if not fields:
        return ""
    parts: list[str] = []
    for key, value in fields.items():
        if value is None:
            continue
        key_text = colorize(f"{key}=", ANSI.BRIGHT_BLACK, dim=True)
        value_text = colorize(compact(value), ANSI.WHITE)
        parts.append(f"{key_text}{value_text}")
    return "  " + "  ".join(parts) if parts else ""


def log_line(level: str, message: str, component: str = "RUNNER", **fields: Any):
    style = LEVEL_STYLES.get(level, LEVEL_STYLES["info"])
    ts = colorize(now_local_hms(), ANSI.BRIGHT_BLACK, dim=True)
    level_text = colorize(style["label"], style["color"], bold=True)
    icon_text = colorize(style["icon"], style["color"], bold=True)
    component_text = colorize(f"{component:<8}", ANSI.BRIGHT_MAGENTA, bold=True)
    msg_text = colorize(message, ANSI.BRIGHT_WHITE if level != "error" else ANSI.BRIGHT_RED)
    extra_text = format_fields(fields)
    print(f"{ts} {level_text} {icon_text} {component_text} {msg_text}{extra_text}", flush=True)


def ws_debug(message: str, **fields: Any):
    if DEBUG_WS:
        log_line("debug", message, component="WS", **fields)


def log_section(title: str, component: str = "RUNNER", **fields: Any):
    line = "─" * 24
    style = colorize(f"{line} {title} {line}", ANSI.BRIGHT_CYAN, bold=True)
    print(style, flush=True)
    if fields:
        log_line("debug", "section-context", component=component, **fields)


def ws_message_summary(message: dict[str, Any]) -> dict[str, Any]:
    payload = message.get("payload") or {}
    summary: dict[str, Any] = {
        "type": message.get("type"),
        "request_id": message.get("request_id"),
    }

    for key in ("run_id", "job_id", "worker_id", "status", "stage", "signal"):
        if key in payload:
            summary[key] = payload.get(key)

    if "message" in payload:
        summary["payload_message"] = compact(payload.get("message"), 80)

    if "progress" in payload:
        summary["progress"] = payload.get("progress")

    if "command" in payload:
        summary["command"] = compact(payload.get("command"), 120)

    return summary


# -----------------------------------------------------------------------------
# Startup and imports
# -----------------------------------------------------------------------------

log_section("Cloud Forge Runner v9")
log_line("info", "booting", component="BOOT")

try:
    import requests
except ImportError:
    log_line("step", "installing missing dependency", component="BOOT", package="requests")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "requests"])
    import requests

try:
    import websocket
except ImportError:
    log_line("step", "installing missing dependency", component="BOOT", package="websocket-client")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "websocket-client"])
    import websocket


JOB_CONFIG_URL = os.getenv("JOB_CONFIG_URL")
RUN_TIMEOUT_SECONDS = int(os.getenv("RUN_TIMEOUT_SECONDS", "600"))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("CLOUD_FORGE_HEARTBEAT_INTERVAL_SECONDS", "10"))
STOP_GRACE_SECONDS = int(os.getenv("CLOUD_FORGE_STOP_GRACE_SECONDS", "10"))

if not JOB_CONFIG_URL:
    log_line("error", "JOB_CONFIG_URL environment variable is required", component="BOOT")
    sys.exit(1)

parsed_job_url = urlsplit(JOB_CONFIG_URL)
SERVER_URL = os.getenv("SERVER_URL") or f"{parsed_job_url.scheme}://{parsed_job_url.netloc}"
QUERY = parse_qs(parsed_job_url.query)
SHARE_TOKEN = (QUERY.get("token") or [None])[0]

HOSTNAME = socket.gethostname()
WORKER_ID = os.getenv("CLOUD_FORGE_WORKER_ID") or f"worker-{HOSTNAME}"
WORKER_NAME = os.getenv("CLOUD_FORGE_WORKER_NAME") or WORKER_ID
WORKER_HOST = os.getenv("CLOUD_FORGE_WORKER_HOST") or HOSTNAME

CURRENT_RUN_ID: str | None = None
WORKSPACE_ROOT: Path | None = None
WORKING_DIR: Path | None = None
ACTIVE_PROCESS: subprocess.Popen | None = None
ACTIVE_PROCESS_LOCK = threading.Lock()

RUNNER_STATE_PATH: Path | None = None
RUNNER_STATE_LOCK = threading.Lock()

cancel_requested_event = threading.Event()
cancel_reason_holder = {"reason": None}

log_line(
    "info",
    "bootstrap configuration loaded",
    component="BOOT",
    job_config_url=JOB_CONFIG_URL,
    server_url=SERVER_URL,
    worker_id=WORKER_ID,
    worker_name=WORKER_NAME,
)


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def is_absolute_url(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("http://") or value.startswith("https://")


def to_absolute_url(value: str | None, fallback_path: str | None = None) -> str | None:
    if value:
        if is_absolute_url(value):
            return value
        return urljoin(SERVER_URL, value)
    if fallback_path:
        return urljoin(SERVER_URL, fallback_path)
    return None


def ws_url_from_http_base(http_url: str) -> str:
    parsed = urlsplit(http_url)
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"
    return f"{ws_scheme}://{parsed.netloc}/ws/worker"


def read_json(path: Path, fallback):
    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def update_runner_state(patch: dict[str, Any]):
    global RUNNER_STATE_PATH
    if RUNNER_STATE_PATH is None:
        return

    with RUNNER_STATE_LOCK:
        state = read_json(RUNNER_STATE_PATH, {})
        if not isinstance(state, dict):
            state = {}

        state.update(patch)
        state["updated_at"] = now_iso()
        write_json(RUNNER_STATE_PATH, state)


def normalize_relative_path(value: str) -> str:
    raw = str(value or "").replace("\\", "/").strip()
    if not raw:
        raise ValueError("Relative path is empty")

    path_obj = PurePosixPath(raw)

    if path_obj.is_absolute():
        raise ValueError(f"Absolute paths are not allowed: {value}")

    parts: list[str] = []
    for part in path_obj.parts:
        if part in ("", "."):
            continue
        if part == "..":
            raise ValueError(f"Parent path segments are not allowed: {value}")
        parts.append(part)

    normalized = PurePosixPath(*parts).as_posix()
    if not normalized:
        raise ValueError(f"Invalid relative path: {value}")

    return normalized


def resolve_workspace_path(workspace_root: Path, raw_value: str | None, default: Path) -> Path:
    if not raw_value:
        return default.resolve()

    raw = str(raw_value).replace("\\", "/").strip()
    if not raw:
        return default.resolve()

    if raw.startswith("/"):
        resolved = Path(raw).resolve()
    else:
        resolved = (workspace_root / normalize_relative_path(raw)).resolve()

    workspace_root_resolved = workspace_root.resolve()
    try:
        resolved.relative_to(workspace_root_resolved)
    except ValueError as exc:
        raise ValueError(f"Path escapes workspace root: {raw_value}") from exc

    return resolved


def make_executable(path: Path):
    try:
        current_mode = path.stat().st_mode
        path.chmod(current_mode | 0o111)
    except Exception:
        pass


def has_shebang(path: Path) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(2) == b"#!"
    except Exception:
        return False


def is_probably_executable_file(path: Path) -> bool:
    if has_shebang(path):
        return True
    return path.suffix.lower() in {".sh", ".bash"}


def list_files_under(root: Path) -> list[str]:
    if not root.exists():
        return []

    files: list[str] = []
    for item in sorted(root.rglob("*")):
        if item.is_file():
            try:
                files.append(item.relative_to(root).as_posix())
            except Exception:
                files.append(str(item))
    return files


def download_file(url: str, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)

    sha256 = hashlib.sha256()
    total_bytes = 0

    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with open(destination, "wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 128):
                if not chunk:
                    continue
                output.write(chunk)
                sha256.update(chunk)
                total_bytes += len(chunk)

    return {
        "bytes": total_bytes,
        "sha256": sha256.hexdigest(),
    }


def upload_run_artifact(artifact_upload_url: str, local_path: Path, relative_path: str):
    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"

    with open(local_path, "rb") as file_handle:
        response = requests.post(
            artifact_upload_url,
            params={"relativePath": relative_path},
            files={"file": (local_path.name, file_handle, content_type)},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()


def update_control_file(
    control_path: Path,
    *,
    cancel_requested: bool,
    cancel_reason: str | None = None,
):
    write_json(
        control_path,
        {
            "cancel_requested": cancel_requested,
            "cancel_reason": cancel_reason,
            "updated_at": now_iso(),
        },
    )


def load_uploaded_relative_paths(uploaded_artifacts_path: Path):
    data = read_json(uploaded_artifacts_path, [])
    if not isinstance(data, list):
        return set()
    return {str(item) for item in data}


def locate_sdk_source(relative_path: str) -> Path:
    base_dir = Path(__file__).resolve().parent
    candidates = [
        base_dir / "sdk" / relative_path,
        Path("/app/sdk") / relative_path,
        Path("/opt/cloudforge/sdk") / relative_path,
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(f"SDK source not found: {relative_path}")


def try_locate_sdk_source(relative_path: str) -> Path | None:
    try:
        return locate_sdk_source(relative_path)
    except FileNotFoundError:
        return None


def install_sdk(workspace_root: Path, execution_language: str):
    sdk_dir = workspace_root / ".cloudforge-sdk"
    sdk_dir.mkdir(parents=True, exist_ok=True)

    python_source = try_locate_sdk_source("python/cloudforge.py")
    javascript_source = try_locate_sdk_source("javascript/cloudforge.js")

    if execution_language == "python":
        if python_source is None:
            raise FileNotFoundError("Required SDK source not found: python/cloudforge.py")
        shutil.copy2(python_source, sdk_dir / "cloudforge.py")
        if javascript_source is not None:
            shutil.copy2(javascript_source, sdk_dir / "cloudforge.js")
        return sdk_dir

    if execution_language == "javascript":
        if javascript_source is None:
            raise FileNotFoundError("Required SDK source not found: javascript/cloudforge.js")
        shutil.copy2(javascript_source, sdk_dir / "cloudforge.js")
        if python_source is not None:
            shutil.copy2(python_source, sdk_dir / "cloudforge.py")
        return sdk_dir

    if python_source is not None:
        shutil.copy2(python_source, sdk_dir / "cloudforge.py")
    if javascript_source is not None:
        shutil.copy2(javascript_source, sdk_dir / "cloudforge.js")

    return sdk_dir


def resolve_command(code_file: Path, execution_language: str, entrypoint_args: list[str]) -> list[str]:
    suffix = code_file.suffix.lower()

    if suffix in {".sh", ".bash"}:
        shell = shutil.which("bash") or shutil.which("sh") or "sh"
        return [shell, str(code_file), *entrypoint_args]

    if suffix in {".js", ".mjs", ".cjs"}:
        return ["node", str(code_file), *entrypoint_args]

    if suffix == ".py":
        return [sys.executable, str(code_file), *entrypoint_args]

    if has_shebang(code_file):
        return [str(code_file), *entrypoint_args]

    if execution_language == "javascript":
        return ["node", str(code_file), *entrypoint_args]

    return [sys.executable, str(code_file), *entrypoint_args]


def download_attached_files(run_id: str, attached_files: list[dict], safe_log, safe_progress):
    total = len(attached_files)

    for index, file_info in enumerate(attached_files, start=1):
        filename = file_info.get("filename")
        mount_path = file_info.get("mount_path")
        download_path = file_info.get("download_path")

        if not filename or not mount_path or not download_path:
            safe_log(
                "Skipping invalid attached file descriptor",
                "warn",
                component="FILES",
                descriptor=file_info,
            )
            continue

        absolute_url = to_absolute_url(download_path)
        destination = Path(mount_path)

        safe_progress(
            stage="downloading-attached-files",
            progress=5 + (index / max(total, 1)) * 10,
            message=f"Downloading attached file {index}/{total}: {filename}",
        )

        safe_log(
            "Downloading attached file",
            "step",
            component="FILES",
            index=f"{index}/{total}",
            filename=filename,
            destination=str(destination),
        )
        meta = download_file(absolute_url, destination)
        safe_log(
            "Attached file downloaded",
            "success",
            component="FILES",
            filename=filename,
            bytes=meta["bytes"],
            sha256=meta["sha256"],
        )


def download_run_files(run_id: str, files: list[dict], workspace_root: Path, safe_log, safe_progress):
    total = len(files)

    for index, file_info in enumerate(files, start=1):
        relative_path = file_info.get("relative_path") or file_info.get("filename")
        download_url = file_info.get("download_url")
        filename = file_info.get("filename") or relative_path
        is_executable = bool(file_info.get("is_executable"))

        if not relative_path or not download_url:
            safe_log(
                "Skipping invalid run file descriptor",
                "warn",
                component="FILES",
                descriptor=file_info,
            )
            continue

        normalized_relative_path = normalize_relative_path(relative_path)
        destination = workspace_root / normalized_relative_path
        absolute_url = to_absolute_url(download_url)

        safe_progress(
            stage="downloading-job-files",
            progress=20 + (index / max(total, 1)) * 25,
            message=f"Downloading job file {index}/{total}: {normalized_relative_path}",
            extra={"file": normalized_relative_path},
        )

        safe_log(
            "Downloading job file",
            "step",
            component="FILES",
            index=f"{index}/{total}",
            filename=filename,
            relative_path=normalized_relative_path,
            destination=str(destination),
        )
        meta = download_file(absolute_url, destination)

        if is_executable or is_probably_executable_file(destination):
            make_executable(destination)

        safe_log(
            "Job file downloaded",
            "success",
            component="FILES",
            relative_path=normalized_relative_path,
            bytes=meta["bytes"],
            sha256=meta["sha256"],
            executable=is_executable or is_probably_executable_file(destination),
        )


def terminate_process(proc: subprocess.Popen, safe_log, reason: str):
    if proc.poll() is not None:
        return

    safe_log("Stopping process", "warn", component="PROC", reason=reason, pid=proc.pid)
    update_runner_state(
        {
            "stage": "stopping",
            "stop_reason": reason,
            "child_pid": proc.pid,
        }
    )

    try:
        proc.terminate()
    except Exception as exc:
        safe_log("Failed to terminate process gracefully", "warn", component="PROC", error=str(exc))

    deadline = time.time() + STOP_GRACE_SECONDS
    while time.time() < deadline:
        if proc.poll() is not None:
            return
        time.sleep(0.2)

    safe_log("Graceful stop timeout reached, killing process", "warn", component="PROC", pid=proc.pid)

    try:
        proc.kill()
    except Exception as exc:
        safe_log("Failed to kill process", "error", component="PROC", error=str(exc))


def upload_artifacts_directory(
    run_id: str,
    artifacts_dir: Path,
    uploaded_artifacts_path: Path,
    artifact_upload_url: str | None,
    safe_log,
    safe_progress,
):
    if not artifact_upload_url:
        safe_log("Artifact upload URL is not configured; skipping upload", "warn", component="ARTIFACTS")
        return {
            "uploaded_count": 0,
            "skipped_count": 0,
            "uploaded_files": [],
        }

    if not artifacts_dir.exists() or not artifacts_dir.is_dir():
        safe_log("Artifacts directory does not exist", "info", component="ARTIFACTS", path=str(artifacts_dir))
        return {
            "uploaded_count": 0,
            "skipped_count": 0,
            "uploaded_files": [],
        }

    files_to_upload = [path for path in artifacts_dir.rglob("*") if path.is_file()]
    already_uploaded = load_uploaded_relative_paths(uploaded_artifacts_path)

    if not files_to_upload:
        safe_log("No artifacts found to upload", "info", component="ARTIFACTS")
        return {
            "uploaded_count": 0,
            "skipped_count": 0,
            "uploaded_files": [],
        }

    uploaded_files = []
    skipped_count = 0
    total = len(files_to_upload)

    for index, local_path in enumerate(files_to_upload, start=1):
        relative_path = local_path.relative_to(artifacts_dir).as_posix()

        if relative_path in already_uploaded:
            skipped_count += 1
            continue

        safe_progress(
            stage="uploading-artifacts",
            progress=90 + (index / max(total, 1)) * 8,
            message=f"Uploading artifact {index}/{total}: {relative_path}",
            extra={"artifact": relative_path},
        )

        safe_log(
            "Uploading artifact",
            "step",
            component="ARTIFACTS",
            index=f"{index}/{total}",
            relative_path=relative_path,
        )

        try:
            result = upload_run_artifact(artifact_upload_url, local_path, relative_path)
            uploaded_files.append(result)
            safe_log(
                "Artifact uploaded",
                "success",
                component="ARTIFACTS",
                relative_path=relative_path,
                storage_key=result.get("storage_key"),
            )
        except Exception as exc:
            safe_log("Failed to upload artifact", "error", component="ARTIFACTS", relative_path=relative_path, error=str(exc))

    safe_log(
        "Artifact upload summary",
        "info",
        component="ARTIFACTS",
        uploaded=len(uploaded_files),
        skipped=skipped_count,
    )

    return {
        "uploaded_count": len(uploaded_files),
        "skipped_count": skipped_count,
        "uploaded_files": uploaded_files,
    }


def signal_child(signal_name: str, safe_log):
    with ACTIVE_PROCESS_LOCK:
        proc = ACTIVE_PROCESS

    if proc is None or proc.poll() is not None:
        safe_log("Cannot deliver signal: child process is not running", "warn", component="PROC", signal=signal_name)
        return False

    sig = getattr(signal, signal_name, None)
    if sig is None or not isinstance(sig, int):
        safe_log("Unsupported signal requested", "warn", component="PROC", signal=signal_name)
        return False

    try:
        os.kill(proc.pid, sig)
        safe_log("Signal delivered to child", "info", component="PROC", pid=proc.pid, signal=signal_name)
        return True
    except Exception as exc:
        safe_log("Failed to deliver signal", "error", component="PROC", signal=signal_name, error=str(exc))
        return False


# -----------------------------------------------------------------------------
# WS client
# -----------------------------------------------------------------------------

class WsControlClient:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.ws = None
        self.connected_event = threading.Event()
        self.closed = False
        self.recv_thread = None
        self.send_lock = threading.Lock()
        self.pending: dict[str, dict[str, Any]] = {}
        self.pending_lock = threading.Lock()
        self.on_command = None

    def connect(self):
        if self.closed:
            raise RuntimeError("WS client is closed")

        if self.ws is not None:
            try:
                if self.ws.connected:
                    return
            except Exception:
                pass

        log_line("step", "connecting websocket", component="WS", url=self.ws_url)
        self.ws = websocket.create_connection(
            self.ws_url,
            timeout=20,
            enable_multithread=True,
        )
        self.connected_event.set()
        log_line("success", "websocket connected", component="WS", url=self.ws_url)
        self.recv_thread = threading.Thread(target=self._recv_loop, daemon=True)
        self.recv_thread.start()

    def reconnect(self):
        log_line("warn", "reconnecting websocket", component="WS", url=self.ws_url)
        self.disconnect()
        time.sleep(1)
        self.connect()

    def disconnect(self):
        self.connected_event.clear()
        if self.ws is not None:
            try:
                self.ws.close()
            except Exception:
                pass
        self.ws = None

    def close(self):
        self.closed = True
        self.disconnect()

    def ensure_connected(self):
        try:
            if self.ws is not None and self.ws.connected:
                return
        except Exception:
            pass
        self.connect()

    def _recv_loop(self):
        while not self.closed:
            try:
                if self.ws is None:
                    break

                raw = self.ws.recv()
                if raw is None:
                    log_line("info", "websocket closed by remote", component="WS")
                    break

                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")

                if not str(raw).strip():
                    log_line("info", "websocket closed by remote", component="WS")
                    break

                try:
                    message = json.loads(raw)
                except Exception as exc:
                    log_line("warn", "failed to decode websocket message", component="WS", error=str(exc), raw=raw)
                    continue

                if DEBUG_WS:
                    ws_debug("ws recv", **ws_message_summary(message))

                request_id = message.get("request_id")

                handled = False
                if request_id:
                    with self.pending_lock:
                        pending = self.pending.get(request_id)
                        if pending is not None:
                            pending["response"] = message
                            pending["event"].set()
                            handled = True

                if handled:
                    continue

                if callable(self.on_command):
                    try:
                        self.on_command(message)
                    except Exception as exc:
                        log_line("warn", "ws command handler failed", component="WS", error=str(exc))

            except Exception as exc:
                log_line("warn", "ws receive loop stopped", component="WS", error=str(exc))
                self.connected_event.clear()
                break

    def send(self, type_: str, payload: dict[str, Any], request_id: str | None = None):
        self.ensure_connected()
        message = {
            "type": type_,
            "request_id": request_id,
            "payload": payload,
        }

        if DEBUG_WS:
            ws_debug("ws send", **ws_message_summary(message))

        encoded = json.dumps(message)

        with self.send_lock:
            if self.ws is None:
                raise RuntimeError("WS is not connected")
            self.ws.send(encoded)

    def request(self, type_: str, payload: dict[str, Any], timeout: int = 30) -> dict[str, Any]:
        request_id = uuid.uuid4().hex
        event = threading.Event()

        with self.pending_lock:
            self.pending[request_id] = {
                "event": event,
                "response": None,
            }

        try:
            self.send(type_, payload, request_id=request_id)
            if not event.wait(timeout):
                raise TimeoutError(
                    f"Timed out waiting for response to {type_} "
                    f"(ws_url={self.ws_url}, request_id={request_id})"
                )

            with self.pending_lock:
                entry = self.pending.get(request_id)

            if not entry or not entry.get("response"):
                raise RuntimeError(f"No response payload for {type_}")

            response = entry["response"]
            if response.get("type") == "error":
                message = ((response.get("payload") or {}).get("message")) or f"{type_} failed"
                raise RuntimeError(str(message))

            return response
        finally:
            with self.pending_lock:
                self.pending.pop(request_id, None)


def request_with_retry(
    ws_client: "WsControlClient",
    type_: str,
    payload: dict[str, Any],
    *,
    attempts: int = 3,
    timeout: int = 20,
):
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            if DEBUG_WS:
                log_line("step", "ws request attempt", component="WS", type=type_, attempt=f"{attempt}/{attempts}")
            return ws_client.request(type_, payload, timeout=timeout)
        except Exception as exc:
            last_error = exc
            if DEBUG_WS:
                log_line("warn", "ws request failed", component="WS", type=type_, attempt=f"{attempt}/{attempts}", error=str(exc))
            if attempt < attempts:
                try:
                    ws_client.reconnect()
                except Exception as reconnect_exc:
                    if DEBUG_WS:
                        log_line("warn", "ws reconnect failed", component="WS", error=str(reconnect_exc))
                time.sleep(1)

    raise last_error if last_error else RuntimeError(f"Failed request: {type_}")


# -----------------------------------------------------------------------------
# Capability detection
# -----------------------------------------------------------------------------

def build_capabilities():
    capabilities: dict[str, Any] = {
        "hostname": HOSTNAME,
        "platform": sys.platform,
        "python_version": sys.version.split()[0],
        "pid": os.getpid(),
    }

    node_bin = shutil.which("node")
    if node_bin:
        try:
            result = subprocess.run(
                [node_bin, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            capabilities["node_version"] = (result.stdout or result.stderr).strip() or None
        except Exception:
            capabilities["node_version"] = None

    bash_bin = shutil.which("bash")
    if bash_bin:
        capabilities["bash"] = bash_bin

    sh_bin = shutil.which("sh")
    if sh_bin:
        capabilities["sh"] = sh_bin

    return capabilities


WORKER_CAPABILITIES = build_capabilities()
CONTROL_WS = WsControlClient(ws_url_from_http_base(SERVER_URL))


def safe_log_factory(run_id_getter):
    def safe_log(
        message: str,
        level: str = "info",
        component: str = "RUNNER",
        send_remote: bool = True,
        **fields: Any,
    ):
        local_level = level if level in LEVEL_STYLES else "info"
        log_line(local_level, message, component=component, **fields)

        run_id = run_id_getter()
        if not run_id or not send_remote:
            return

        remote_level = "info"
        if local_level in {"warn", "error"}:
            remote_level = local_level

        try:
            CONTROL_WS.send(
                "run.log",
                {
                    "run_id": run_id,
                    "message": message,
                    "level": remote_level,
                },
            )
        except Exception:
            pass

    return safe_log


def safe_progress_factory(run_id_getter):
    def safe_progress(
        *,
        stage: str | None = None,
        progress: float | int | None = None,
        message: str | None = None,
        extra: dict[str, Any] | None = None,
    ):
        run_id = run_id_getter()
        if not run_id:
            return

        payload: dict[str, Any] = {"run_id": run_id}
        if stage is not None:
            payload["stage"] = stage
        if progress is not None:
            payload["progress"] = progress
        if message is not None:
            payload["message"] = message
        if extra is not None:
            payload["extra"] = extra

        try:
            CONTROL_WS.send("run.progress", payload)
        except Exception:
            pass

    return safe_progress


def handle_control_message(message: dict[str, Any], safe_log):
    message_type = message.get("type")
    payload = message.get("payload") or {}
    request_id = message.get("request_id")

    if message_type == "run.stop":
        reason = str(payload.get("reason") or "Stop requested by backend")
        cancel_reason_holder["reason"] = reason
        cancel_requested_event.set()
        safe_log("Remote stop requested", "warn", component="CTRL", reason=reason)
        return

    if message_type == "run.signal":
        signal_name = str(payload.get("signal") or "").strip()
        if not signal_name:
            return
        signal_child(signal_name, safe_log)
        return

    if message_type == "run.exec":
        command = str(payload.get("command") or "").strip()
        args = payload.get("args") or []
        cwd_raw = payload.get("cwd")
        timeout_seconds = int(payload.get("timeout_seconds") or 30)

        if not isinstance(args, list):
            args = [str(args)]

        try:
            if not command:
                raise RuntimeError("command is required")

            if WORKSPACE_ROOT is None or WORKING_DIR is None:
                raise RuntimeError("workspace is not initialized")

            cwd = resolve_workspace_path(
                WORKSPACE_ROOT,
                cwd_raw,
                WORKING_DIR,
            )

            safe_log("Executing remote command", "info", component="CTRL", command=command, args=args, cwd=str(cwd))

            result = subprocess.run(
                [command, *[str(arg) for arg in args]],
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )

            CONTROL_WS.send(
                "run.exec.result",
                {
                    "ok": result.returncode == 0,
                    "returncode": result.returncode,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "cwd": str(cwd),
                },
                request_id=request_id,
            )
        except Exception as exc:
            CONTROL_WS.send(
                "run.exec.result",
                {
                    "ok": False,
                    "returncode": None,
                    "stdout": "",
                    "stderr": str(exc),
                },
                request_id=request_id,
            )
        return


safe_log = safe_log_factory(lambda: CURRENT_RUN_ID)
safe_progress = safe_progress_factory(lambda: CURRENT_RUN_ID)
CONTROL_WS.on_command = lambda message: handle_control_message(message, safe_log)


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main():
    global CURRENT_RUN_ID, WORKSPACE_ROOT, WORKING_DIR, ACTIVE_PROCESS, RUNNER_STATE_PATH

    if not SHARE_TOKEN:
        log_line("error", "JOB_CONFIG_URL must contain ?token=", component="BOOT")
        sys.exit(1)

    CONTROL_WS.connect()

    hello_response = request_with_retry(
        CONTROL_WS,
        "worker.hello",
        {
            "worker_id": WORKER_ID,
            "worker_name": WORKER_NAME,
            "worker_host": WORKER_HOST,
            "capabilities": WORKER_CAPABILITIES,
        },
        attempts=3,
        timeout=20,
    )
    log_line("success", "worker hello acknowledged", component="WS", **(hello_response.get("payload") or {}))

    claim_response = request_with_retry(
        CONTROL_WS,
        "run.claim",
        {
            "token": SHARE_TOKEN,
        },
        attempts=3,
        timeout=30,
    )

    claim_payload = claim_response.get("payload") or {}
    run_id = claim_payload.get("run_id")
    job_id = claim_payload.get("job_id")
    config = claim_payload.get("config") or {}

    if not run_id or not job_id:
        log_line("error", "invalid run assignment over WS", component="WS")
        sys.exit(1)

    CURRENT_RUN_ID = str(run_id)

    workspace = config.get("workspace") or {}
    workspace_root = Path(workspace.get("root", "/workspace")).resolve()
    artifacts_dir = resolve_workspace_path(
        workspace_root,
        workspace.get("artifacts_dir"),
        workspace_root / "artifacts",
    )
    tmp_dir = resolve_workspace_path(
        workspace_root,
        workspace.get("tmp_dir"),
        workspace_root / "tmp",
    )
    input_dir = resolve_workspace_path(
        workspace_root,
        workspace.get("input_dir"),
        workspace_root / "input",
    )
    output_dir = resolve_workspace_path(
        workspace_root,
        workspace.get("output_dir"),
        workspace_root / "output",
    )
    working_dir = resolve_workspace_path(
        workspace_root,
        config.get("working_dir"),
        workspace_root,
    )
    code_dir = resolve_workspace_path(
        workspace_root,
        workspace.get("code_dir"),
        working_dir,
    )

    WORKSPACE_ROOT = workspace_root
    WORKING_DIR = working_dir

    state_dir = workspace_root / ".cloudforge"
    runtime_path = state_dir / "runtime.json"
    control_path = state_dir / "control.json"
    runner_state_path = state_dir / "runner-state.json"
    uploaded_artifacts_path = state_dir / "uploaded-artifacts.json"

    RUNNER_STATE_PATH = runner_state_path

    for directory in [
        workspace_root,
        working_dir,
        code_dir,
        input_dir,
        output_dir,
        artifacts_dir,
        tmp_dir,
        state_dir,
    ]:
        directory.mkdir(parents=True, exist_ok=True)

    update_control_file(control_path, cancel_requested=False, cancel_reason=None)
    write_json(uploaded_artifacts_path, [])

    execution_language = config.get("execution_language", "python")
    execution_code = config.get("execution_code", "")
    entrypoint = config.get("entrypoint")
    entrypoint_args = config.get("entrypoint_args") or []

    if not isinstance(entrypoint_args, list):
        entrypoint_args = [str(entrypoint_args)]
    entrypoint_args = [str(arg) for arg in entrypoint_args]

    sdk_dir = install_sdk(workspace_root, execution_language)

    runtime_payload = {
        "run_id": run_id,
        "job_id": job_id,
        "server_url": SERVER_URL,
        "worker_id": WORKER_ID,
        "worker_name": WORKER_NAME,
        "worker_host": WORKER_HOST,
        "control": {
            "ws_url": CONTROL_WS.ws_url,
        },
        "workspace": {
            "root": str(workspace_root),
            "working_dir": str(working_dir),
            "code_dir": str(code_dir),
            "input_dir": str(input_dir),
            "output_dir": str(output_dir),
            "artifacts_dir": str(artifacts_dir),
            "tmp_dir": str(tmp_dir),
            "sdk_dir": str(sdk_dir),
        },
    }
    write_json(runtime_path, runtime_payload)

    write_json(
        runner_state_path,
        {
            "run_id": run_id,
            "job_id": job_id,
            "status": "preparing",
            "stage": "initializing",
            "execution_language": execution_language,
            "workspace_root": str(workspace_root),
            "working_dir": str(working_dir),
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
    )

    os.environ["CLOUD_FORGE_RUN_ID"] = str(run_id)
    os.environ["CLOUD_FORGE_JOB_ID"] = str(job_id)
    os.environ["CLOUD_FORGE_WORKER_ID"] = WORKER_ID
    os.environ["CLOUD_FORGE_WORKER_NAME"] = WORKER_NAME
    os.environ["CLOUD_FORGE_WORKER_HOST"] = WORKER_HOST
    os.environ["CLOUD_FORGE_WORKSPACE_ROOT"] = str(workspace_root)
    os.environ["CLOUD_FORGE_WORKING_DIR"] = str(working_dir)
    os.environ["CLOUD_FORGE_CODE_DIR"] = str(code_dir)
    os.environ["CLOUD_FORGE_INPUT_DIR"] = str(input_dir)
    os.environ["CLOUD_FORGE_OUTPUT_DIR"] = str(output_dir)
    os.environ["CLOUD_FORGE_ARTIFACTS_DIR"] = str(artifacts_dir)
    os.environ["CLOUD_FORGE_TMP_DIR"] = str(tmp_dir)
    os.environ["CLOUD_FORGE_SERVER_URL"] = SERVER_URL
    os.environ["CLOUD_FORGE_RUNTIME_PATH"] = str(runtime_path)
    os.environ["CLOUD_FORGE_CONTROL_PATH"] = str(control_path)
    os.environ["CLOUD_FORGE_UPLOADED_ARTIFACTS_PATH"] = str(uploaded_artifacts_path)
    os.environ.setdefault("TERM", "xterm")

    existing_pythonpath = os.environ.get("PYTHONPATH", "")
    existing_node_path = os.environ.get("NODE_PATH", "")

    python_paths = [str(sdk_dir)]
    node_paths = [str(sdk_dir)]

    if existing_pythonpath:
        python_paths.append(existing_pythonpath)

    if existing_node_path:
        node_paths.append(existing_node_path)

    os.environ["PYTHONPATH"] = os.pathsep.join(python_paths)
    os.environ["NODE_PATH"] = os.pathsep.join(node_paths)

    environments = config.get("environment_variables") or config.get("environments") or {}
    if isinstance(environments, dict):
        for key, value in environments.items():
            os.environ[str(key)] = str(value)

    log_section("Run context")
    safe_log("Run claimed via WS", "success", component="RUN", run_id=run_id, job_id=job_id)
    safe_log("Workspace prepared", "info", component="RUN", workspace_root=str(workspace_root), working_dir=str(working_dir))
    safe_log("SDK installed", "info", component="RUN", sdk_dir=str(sdk_dir))
    safe_log(
        "Run config summary",
        "info",
        component="RUN",
        language=execution_language,
        entrypoint=entrypoint,
        entrypoint_args=entrypoint_args,
        env_keys=sorted(list(environments.keys())) if isinstance(environments, dict) else [],
    )

    safe_progress(stage="claimed", progress=2, message="Run claimed by worker")

    attached_files = config.get("attached_files") or []
    run_files = config.get("files") or []
    artifact_upload_url = to_absolute_url(
        (config.get("artifacts") or {}).get("upload_url"),
        f"/artifacts/upload-run?runId={run_id}",
    )

    safe_log(
        "File manifest summary",
        "info",
        component="FILES",
        attached_files=len(attached_files),
        run_files=len(run_files),
    )

    try:
        if attached_files:
            download_attached_files(run_id, attached_files, safe_log, safe_progress)
        if run_files:
            download_run_files(run_id, run_files, workspace_root, safe_log, safe_progress)
    except Exception as exc:
        safe_log("Failed while downloading files", "error", component="FILES", error=str(exc))
        safe_progress(stage="failed", progress=100, message=f"File download failed: {exc}")
        CONTROL_WS.send(
            "run.finished",
            {
                "run_id": run_id,
                "status": "failed",
                "result": f"Failed while downloading files: {exc}",
            },
        )
        sys.exit(1)

    safe_log(
        "Workspace files after download",
        "info",
        component="FILES",
        files=list_files_under(workspace_root),
    )

    if not execution_code and not entrypoint:
        safe_log("No execution_code or entrypoint provided", "error", component="RUN")
        safe_progress(stage="failed", progress=100, message="No execution_code or entrypoint provided")
        CONTROL_WS.send(
            "run.finished",
            {
                "run_id": run_id,
                "status": "failed",
                "result": "No execution_code or entrypoint provided",
            },
        )
        sys.exit(1)

    if entrypoint:
        try:
            normalized_entrypoint = normalize_relative_path(entrypoint)
        except Exception as exc:
            safe_log("Invalid entrypoint", "error", component="RUN", error=str(exc), entrypoint=entrypoint)
            safe_progress(stage="failed", progress=100, message=f"Invalid entrypoint: {exc}")
            CONTROL_WS.send(
                "run.finished",
                {
                    "run_id": run_id,
                    "status": "failed",
                    "result": f"Invalid entrypoint: {exc}",
                },
            )
            sys.exit(1)
    else:
        normalized_entrypoint = "main.js" if execution_language == "javascript" else "main.py"

    code_file = (working_dir / normalized_entrypoint).resolve()

    try:
        code_file.relative_to(workspace_root)
    except ValueError:
        safe_log("Entrypoint escapes workspace root", "error", component="RUN", path=str(code_file))
        safe_progress(stage="failed", progress=100, message="Entrypoint escapes workspace root")
        CONTROL_WS.send(
            "run.finished",
            {
                "run_id": run_id,
                "status": "failed",
                "result": "Entrypoint escapes workspace root",
            },
        )
        sys.exit(1)

    code_file.parent.mkdir(parents=True, exist_ok=True)

    if execution_code:
        safe_progress(stage="materializing-execution-code", progress=48, message="Writing execution_code")
        code_file.write_text(execution_code, encoding="utf-8")
        if is_probably_executable_file(code_file):
            make_executable(code_file)
        safe_log(
            "Execution code saved",
            "success",
            component="RUN",
            path=str(code_file),
            bytes=len(execution_code.encode("utf-8")),
        )

    if not code_file.exists():
        available_files = list_files_under(workspace_root)
        safe_log(
            "Entrypoint file not found",
            "error",
            component="RUN",
            expected=str(code_file),
            available_files=available_files,
        )
        safe_progress(stage="failed", progress=100, message=f"Entrypoint not found: {normalized_entrypoint}")
        CONTROL_WS.send(
            "run.finished",
            {
                "run_id": run_id,
                "status": "failed",
                "result": f"Entrypoint file not found: {normalized_entrypoint}",
            },
        )
        sys.exit(1)

    command = resolve_command(code_file, execution_language, entrypoint_args)

    request_with_retry(
        CONTROL_WS,
        "run.started",
        {
            "run_id": run_id,
        },
        attempts=2,
        timeout=15,
    )

    safe_progress(stage="starting", progress=55, message="Starting process", extra={"command": command})
    safe_log("Starting process", "step", component="PROC", command=command)
    safe_log("Process working directory", "info", component="PROC", cwd=str(working_dir))

    process = None
    stdout_thread = None
    stderr_thread = None
    heartbeat_thread = None
    timed_out = False
    cancelled = False
    heartbeat_stop_event = threading.Event()

    def handle_signal(signum, _frame):
        signal_name = signal.Signals(signum).name
        cancel_reason_holder["reason"] = f"Worker received signal {signal_name}"
        cancel_requested_event.set()
        update_control_file(
            control_path,
            cancel_requested=True,
            cancel_reason=cancel_reason_holder["reason"],
        )
        safe_log("Received signal, stopping child process", "warn", component="PROC", signal=signal_name)
        safe_progress(
            stage="stopping",
            progress=96,
            message=f"Received signal {signal_name}",
        )

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    def heartbeat_loop():
        heartbeat_count = 0

        while not heartbeat_stop_event.is_set():
            heartbeat_count += 1

            try:
                response = CONTROL_WS.request(
                    "run.heartbeat",
                    {
                        "run_id": run_id,
                    },
                    timeout=10,
                )
                payload = response.get("payload") or {}
                update_runner_state(
                    {
                        "last_heartbeat_ok_at": now_iso(),
                        "heartbeat_count": heartbeat_count,
                        "last_heartbeat_response": payload,
                    }
                )

                if payload.get("should_stop"):
                    cancel_requested_event.set()
                    cancel_reason_holder["reason"] = payload.get("stop_reason") or "Stop requested by orchestrator"
                    update_control_file(
                        control_path,
                        cancel_requested=True,
                        cancel_reason=cancel_reason_holder["reason"],
                    )
                    safe_log("Remote stop requested", "warn", component="CTRL", reason=cancel_reason_holder["reason"])
                    safe_progress(
                        stage="stopping",
                        progress=97,
                        message=cancel_reason_holder["reason"],
                    )
            except Exception as exc:
                if DEBUG_WS:
                    safe_log("Heartbeat failed", "warn", component="WS", error=str(exc))

            heartbeat_stop_event.wait(HEARTBEAT_INTERVAL_SECONDS)

    def pump_stream(stream, level: str, component: str):
        try:
            for raw_line in iter(stream.readline, ""):
                line = raw_line.rstrip("\n")
                if line:
                    local_level = "error" if level == "error" else "info"
                    safe_log(line, local_level, component=component)
        finally:
            try:
                stream.close()
            except Exception:
                pass

    try:
        process = subprocess.Popen(
            command,
            cwd=str(working_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=os.environ.copy(),
        )

        with ACTIVE_PROCESS_LOCK:
            ACTIVE_PROCESS = process

        update_runner_state(
            {
                "status": "running",
                "stage": "running",
                "child_pid": process.pid,
                "command": command,
                "working_dir": str(working_dir),
                "entrypoint": normalized_entrypoint,
                "started_at": now_iso(),
            }
        )

        safe_log("Child process started", "success", component="PROC", pid=process.pid)

        stdout_thread = threading.Thread(target=pump_stream, args=(process.stdout, "info", "STDOUT"), daemon=True)
        stderr_thread = threading.Thread(target=pump_stream, args=(process.stderr, "error", "STDERR"), daemon=True)
        stdout_thread.start()
        stderr_thread.start()

        heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        heartbeat_thread.start()

        safe_progress(stage="running", progress=60, message="Process is running")

        deadline = time.time() + RUN_TIMEOUT_SECONDS

        while True:
            return_code = process.poll()
            if return_code is not None:
                break

            if cancel_requested_event.is_set():
                cancelled = True
                terminate_process(process, safe_log, cancel_reason_holder["reason"] or "Cancellation requested")
                break

            if time.time() >= deadline:
                timed_out = True
                safe_log("Execution timed out", "error", component="PROC", timeout_seconds=RUN_TIMEOUT_SECONDS)
                safe_progress(
                    stage="timed-out",
                    progress=99,
                    message=f"Execution timed out after {RUN_TIMEOUT_SECONDS} seconds",
                )
                terminate_process(process, safe_log, "Execution timeout")
                break

            time.sleep(1)

        if process.poll() is None:
            terminate_process(process, safe_log, "Process still running after control loop")

    except Exception as exc:
        safe_log("Error during execution", "error", component="PROC", error=str(exc))
        update_runner_state({"status": "failed", "stage": "runner-error", "error": str(exc)})
        if process:
            terminate_process(process, safe_log, "Unhandled runner exception")

    finally:
        with ACTIVE_PROCESS_LOCK:
            ACTIVE_PROCESS = None

    if stdout_thread:
        stdout_thread.join(timeout=5)
    if stderr_thread:
        stderr_thread.join(timeout=5)

    heartbeat_stop_event.set()
    if heartbeat_thread:
        heartbeat_thread.join(timeout=2)

    safe_progress(stage="uploading-artifacts", progress=90, message="Uploading artifacts")
    artifact_upload_summary = upload_artifacts_directory(
        run_id,
        artifacts_dir,
        uploaded_artifacts_path,
        artifact_upload_url,
        safe_log,
        safe_progress,
    )

    exit_code = process.returncode if process is not None else None

    if cancelled:
        final_status = "cancelled"
        final_result = cancel_reason_holder["reason"] or "Run cancelled by orchestrator"
    elif timed_out:
        final_status = "failed"
        final_result = f"Execution timed out after {RUN_TIMEOUT_SECONDS} seconds"
    elif process is None:
        final_status = "failed"
        final_result = "Process did not start"
    else:
        final_status = "finished" if exit_code == 0 else "failed"
        final_result = f"Process exited with code {exit_code}"

    metrics = {
        "execution_language": execution_language,
        "timeout_seconds": RUN_TIMEOUT_SECONDS,
        "exit_code": exit_code,
        "workspace_root": str(workspace_root),
        "working_dir": str(working_dir),
        "worker_id": WORKER_ID,
        "worker_name": WORKER_NAME,
        "artifact_upload": artifact_upload_summary,
        "cancelled": cancelled,
        "sdk_dir": str(sdk_dir),
        "entrypoint": normalized_entrypoint,
        "entrypoint_args": entrypoint_args,
        "command": command,
        "workspace_files": list_files_under(workspace_root),
    }

    update_runner_state(
        {
            "status": final_status,
            "stage": "finished",
            "finished_at": now_iso(),
            "exit_code": exit_code,
            "result": final_result,
            "metrics": metrics,
        }
    )

    log_section("Run summary")
    safe_log("Final status", "success" if final_status == "finished" else "error", component="RUN", status=final_status, result=final_result, exit_code=exit_code)
    safe_progress(stage=final_status, progress=100, message=final_result, extra={"metrics": metrics})

    try:
        request_with_retry(
            CONTROL_WS,
            "run.finished",
            {
                "run_id": run_id,
                "status": final_status,
                "result": final_result,
                "metrics": metrics,
            },
            attempts=2,
            timeout=15,
        )
    except Exception as exc:
        log_line("warn", "failed to confirm run.finished", component="WS", error=str(exc))

    log_line("success", "runner completed", component="BOOT", run_id=run_id, status=final_status)


if __name__ == "__main__":
    try:
        main()
    finally:
        try:
            CONTROL_WS.close()
        except Exception:
            pass