#!/usr/bin/env bash
set -e

# Usage: ./deploy-worker.sh [tag]
TAG=${1:-latest}
IMAGE_NAME="xproger/cloud-forge-worker:$TAG"

echo "Building and publishing worker image: $IMAGE_NAME..."
# Note: uses the script from the worker app
./apps/worker/scripts/publish-worker.sh --version "$TAG" --image xproger/cloud-forge-worker --single-platform
