#!/usr/bin/env bash
set -e

# Usage: ./deploy-web.sh [tag]
TAG=${1:-latest}
IMAGE_NAME="cloud-forge-web:$TAG"

echo "Building web image: $IMAGE_NAME..."
docker build -t "$IMAGE_NAME" -f apps/web/Dockerfile apps/web

echo "Deploying web..."
export WEB_IMAGE="$IMAGE_NAME"
docker compose -f infra/compose/docker-compose.prod.yml up -d web
