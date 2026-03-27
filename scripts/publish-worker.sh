#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_DEFAULT="xproger/cloud-forge-worker"
DOCKERFILE_DEFAULT="Dockerfile.worker"
CONTEXT_DEFAULT="."
PLATFORMS_DEFAULT="linux/amd64,linux/arm64"
BUILDER_NAME_DEFAULT="cloudforge-worker-builder"

IMAGE="${IMAGE:-$IMAGE_DEFAULT}"
DOCKERFILE="${DOCKERFILE:-$DOCKERFILE_DEFAULT}"
CONTEXT="${CONTEXT:-$CONTEXT_DEFAULT}"
PLATFORMS="${PLATFORMS:-$PLATFORMS_DEFAULT}"
BUILDER_NAME="${BUILDER_NAME:-$BUILDER_NAME_DEFAULT}"

BUMP_KIND="patch"
EXPLICIT_VERSION=""
PUSH_LATEST="true"
MULTI_PLATFORM="true"
DRY_RUN="false"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") [options]

Options:
  --image <namespace/repo>       Docker image name (default: ${IMAGE_DEFAULT})
  --dockerfile <path>            Dockerfile path (default: ${DOCKERFILE_DEFAULT})
  --context <path>               Build context (default: ${CONTEXT_DEFAULT})
  --platforms <list>             Buildx platforms (default: ${PLATFORMS_DEFAULT})
  --builder <name>               Buildx builder name (default: ${BUILDER_NAME_DEFAULT})

  --major                        Increment major version
  --minor                        Increment minor version
  --patch                        Increment patch version (default)

  --version <x.y.z>              Use explicit version instead of auto-increment
  --single-platform              Use classic docker build + docker push instead of buildx
  --no-latest                    Do not publish :latest
  --dry-run                      Print commands without executing
  -h, --help                     Show help

Examples:
  $(basename "$0")
  $(basename "$0") --minor
  $(basename "$0") --version 0.2.0
  $(basename "$0") --image yourname/cloud-forge-worker
  $(basename "$0") --single-platform
EOF
}

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf 'DRY-RUN: '
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: required command not found: $1" >&2
    exit 1
  }
}

is_semver() {
  [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --image)
        IMAGE="$2"
        shift 2
        ;;
      --dockerfile)
        DOCKERFILE="$2"
        shift 2
        ;;
      --context)
        CONTEXT="$2"
        shift 2
        ;;
      --platforms)
        PLATFORMS="$2"
        shift 2
        ;;
      --builder)
        BUILDER_NAME="$2"
        shift 2
        ;;
      --major)
        BUMP_KIND="major"
        shift
        ;;
      --minor)
        BUMP_KIND="minor"
        shift
        ;;
      --patch)
        BUMP_KIND="patch"
        shift
        ;;
      --version)
        EXPLICIT_VERSION="$2"
        shift 2
        ;;
      --single-platform)
        MULTI_PLATFORM="false"
        shift
        ;;
      --no-latest)
        PUSH_LATEST="false"
        shift
        ;;
      --dry-run)
        DRY_RUN="true"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1" >&2
        usage
        exit 1
        ;;
    esac
  done
}

fetch_latest_version() {
  python3 - "$IMAGE" <<'PY'
import json
import re
import sys
import urllib.error
import urllib.request

image = sys.argv[1]
if "/" not in image:
    print("ERROR: image must be in namespace/repository form", file=sys.stderr)
    sys.exit(1)

namespace, repository = image.split("/", 1)
url = f"https://hub.docker.com/v2/namespaces/{namespace}/repositories/{repository}/tags?page_size=100"
pattern = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")

best = None

while url:
    try:
        with urllib.request.urlopen(url) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print("0.0.0")
            sys.exit(0)
        raise

    for item in data.get("results", []):
        name = (item or {}).get("name") or ""
        match = pattern.fullmatch(name)
        if not match:
            continue
        version = tuple(int(part) for part in match.groups())
        if best is None or version > best:
            best = version

    url = data.get("next")

if best is None:
    print("0.0.0")
else:
    print("{}.{}.{}".format(*best))
PY
}

bump_version() {
  python3 - "$1" "$2" <<'PY'
import sys

current = sys.argv[1]
kind = sys.argv[2]

major, minor, patch = map(int, current.split("."))

if kind == "major":
    major += 1
    minor = 0
    patch = 0
elif kind == "minor":
    minor += 1
    patch = 0
else:
    patch += 1

print(f"{major}.{minor}.{patch}")
PY
}

ensure_builder() {
  if docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    run docker buildx use "$BUILDER_NAME"
  else
    run docker buildx create \
      --name "$BUILDER_NAME" \
      --driver docker-container \
      --bootstrap \
      --use
  fi

  run docker buildx inspect --bootstrap
}

build_and_push_multi() {
  local version="$1"

  local cmd=(
    docker buildx build
    -f "$DOCKERFILE"
    --platform "$PLATFORMS"
    --build-arg "VERSION=$version"
    -t "$IMAGE:$version"
  )

  if [[ "$PUSH_LATEST" == "true" ]]; then
    cmd+=(-t "$IMAGE:latest")
  fi

  cmd+=(--push "$CONTEXT")

  run "${cmd[@]}"
}

build_and_push_single() {
  local version="$1"

  local build_cmd=(
    docker build
    -f "$DOCKERFILE"
    --build-arg "VERSION=$version"
    -t "$IMAGE:$version"
  )

  if [[ "$PUSH_LATEST" == "true" ]]; then
    build_cmd+=(-t "$IMAGE:latest")
  fi

  build_cmd+=("$CONTEXT")

  run "${build_cmd[@]}"
  run docker push "$IMAGE:$version"

  if [[ "$PUSH_LATEST" == "true" ]]; then
    run docker push "$IMAGE:latest"
  fi
}

main() {
  parse_args "$@"

  require_cmd docker
  require_cmd python3

  [[ -f "$DOCKERFILE" ]] || {
    echo "Error: Dockerfile not found: $DOCKERFILE" >&2
    exit 1
  }

  [[ -d "$CONTEXT" ]] || {
    echo "Error: build context directory not found: $CONTEXT" >&2
    exit 1
  }

  local version
  if [[ -n "$EXPLICIT_VERSION" ]]; then
    if ! is_semver "$EXPLICIT_VERSION"; then
      echo "Error: --version must be in x.y.z format" >&2
      exit 1
    fi
    version="$EXPLICIT_VERSION"
    log "Using explicit version: $version"
  else
    log "Fetching latest published version for $IMAGE from Docker Hub"
    local latest
    latest="$(fetch_latest_version)"
    if ! is_semver "$latest"; then
      echo "Error: failed to detect latest version, got: $latest" >&2
      exit 1
    fi
    version="$(bump_version "$latest" "$BUMP_KIND")"
    log "Latest version: $latest"
    log "Next version:   $version"
  fi

  log "Image:      $IMAGE"
  log "Dockerfile: $DOCKERFILE"
  log "Context:    $CONTEXT"

  if [[ "$MULTI_PLATFORM" == "true" ]]; then
    log "Mode:       multi-platform ($PLATFORMS)"
    ensure_builder
    build_and_push_multi "$version"
  else
    log "Mode:       single-platform"
    build_and_push_single "$version"
  fi

  printf '\nPublished:\n'
  printf '  %s:%s\n' "$IMAGE" "$version"
  if [[ "$PUSH_LATEST" == "true" ]]; then
    printf '  %s:latest\n' "$IMAGE"
  fi

  printf '\nUse in backend .env:\n'
  printf '  PUBLISHED_WORKER_IMAGE=%s\n' "$IMAGE"
  printf '  PUBLISHED_WORKER_TAG=%s\n' "$version"
}

main "$@"