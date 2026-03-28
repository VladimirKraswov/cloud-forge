import json
import mimetypes
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


class CloudForgeError(Exception):
    pass


class RunCancelledError(CloudForgeError):
    pass


def _env(name: str, default: Optional[str] = None) -> str:
    value = os.getenv(name, default)
    if value is None:
        raise CloudForgeError(f"Missing environment variable: {name}")
    return value


def _server_url() -> str:
    return _env("CLOUD_FORGE_SERVER_URL")


def _run_id() -> str:
    return _env("CLOUD_FORGE_RUN_ID")


def _job_id() -> str:
    return _env("CLOUD_FORGE_JOB_ID")


def _control_path() -> Path:
    return Path(_env("CLOUD_FORGE_CONTROL_PATH"))


def _runtime_path() -> Path:
    return Path(_env("CLOUD_FORGE_RUNTIME_PATH"))


def _uploaded_artifacts_path() -> Path:
    return Path(_env("CLOUD_FORGE_UPLOADED_ARTIFACTS_PATH"))


def _workspace_path(name: str) -> Path:
    return Path(_env(name))


def _read_json_file(path: Path, fallback: Any) -> Any:
    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def runtime() -> Dict[str, Any]:
    return _read_json_file(_runtime_path(), {})


def control() -> Dict[str, Any]:
    return _read_json_file(
        _control_path(),
        {
            "cancel_requested": False,
            "cancel_reason": None,
        },
    )


def run_id() -> str:
    return _run_id()


def job_id() -> str:
    return _job_id()


def server_url() -> str:
    return _server_url()


def workspace_root() -> Path:
    return _workspace_path("CLOUD_FORGE_WORKSPACE_ROOT")


def code_dir() -> Path:
    return _workspace_path("CLOUD_FORGE_CODE_DIR")


def input_dir() -> Path:
    return _workspace_path("CLOUD_FORGE_INPUT_DIR")


def output_dir() -> Path:
    return _workspace_path("CLOUD_FORGE_OUTPUT_DIR")


def artifacts_dir() -> Path:
    return _workspace_path("CLOUD_FORGE_ARTIFACTS_DIR")


def tmp_dir() -> Path:
    return _workspace_path("CLOUD_FORGE_TMP_DIR")


def input_path(*parts: str) -> Path:
    return input_dir().joinpath(*parts)


def output_path(*parts: str) -> Path:
    return output_dir().joinpath(*parts)


def artifacts_path(*parts: str) -> Path:
    return artifacts_dir().joinpath(*parts)


def tmp_path(*parts: str) -> Path:
    return tmp_dir().joinpath(*parts)


def get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    return os.getenv(name, default)


def list_input_files() -> List[Path]:
    base = input_dir()
    if not base.exists():
      return []
    return [path for path in base.rglob("*") if path.is_file()]


def log(message: Any, level: str = "info") -> None:
    text = str(message)
    requests.post(
        f"{server_url()}/api/runs/logs",
        json={
            "run_id": run_id(),
            "message": text,
            "level": level,
        },
        timeout=5,
    )


def info(message: Any) -> None:
    log(message, "info")


def warn(message: Any) -> None:
    log(message, "warn")


def error(message: Any) -> None:
    log(message, "error")


def is_cancel_requested() -> bool:
    return bool(control().get("cancel_requested"))


def cancel_reason() -> Optional[str]:
    value = control().get("cancel_reason")
    return str(value) if value is not None else None


def raise_if_cancel_requested() -> None:
    if is_cancel_requested():
        raise RunCancelledError(cancel_reason() or "Run cancellation requested")


def _load_uploaded_artifacts() -> List[str]:
    data = _read_json_file(_uploaded_artifacts_path(), [])
    if not isinstance(data, list):
        return []
    return [str(item) for item in data]


def _save_uploaded_artifact(relative_path: str) -> None:
    uploaded = _load_uploaded_artifacts()
    if relative_path not in uploaded:
        uploaded.append(relative_path)
        _write_json_file(_uploaded_artifacts_path(), uploaded)


def upload_artifact(
    path: str | Path,
    relative_path: Optional[str] = None,
    mime_type: Optional[str] = None,
) -> Dict[str, Any]:
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        raise CloudForgeError(f"Artifact not found: {file_path}")

    resolved_relative_path = relative_path
    artifacts_root = artifacts_dir().resolve()

    if resolved_relative_path is None:
        try:
            resolved_relative_path = file_path.resolve().relative_to(artifacts_root).as_posix()
        except Exception:
            resolved_relative_path = file_path.name

    resolved_mime_type = mime_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"

    with open(file_path, "rb") as handle:
        response = requests.post(
            f"{server_url()}/artifacts/upload-run",
            params={
                "runId": run_id(),
                "relativePath": resolved_relative_path,
            },
            files={
                "file": (file_path.name, handle, resolved_mime_type),
            },
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()

    try:
        file_path.resolve().relative_to(artifacts_root)
        _save_uploaded_artifact(resolved_relative_path)
    except Exception:
        pass

    return payload


def upload_artifacts_directory(directory: str | Path) -> List[Dict[str, Any]]:
    base = Path(directory)
    if not base.exists() or not base.is_dir():
        return []

    uploaded: List[Dict[str, Any]] = []

    for file_path in sorted(base.rglob("*")):
        if not file_path.is_file():
            continue

        relative_path = file_path.relative_to(base).as_posix()
        uploaded.append(upload_artifact(file_path, relative_path=relative_path))

    return uploaded