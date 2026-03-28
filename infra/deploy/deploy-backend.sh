#!/usr/bin/env bash
set -e

# Usage: ./deploy-backend.sh [tag]
TAG=${1:-latest}
IMAGE_NAME="cloud-forge-backend:$TAG"

echo "Building backend image: $IMAGE_NAME..."
docker build -t "$IMAGE_NAME" -f apps/backend/Dockerfile apps/backend

echo "Deploying backend..."
# Assuming we are in the same folder where docker-compose.prod.yml is.
# Or we can use the environment variables to update the service.
export BACKEND_IMAGE="$IMAGE_NAME"
docker compose -f infra/compose/docker-compose.prod.yml up -d backend
