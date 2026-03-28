FROM python:3.11-slim

ARG VERSION=0.1.0

LABEL org.opencontainers.image.title="Cloud Forge Worker" \
      org.opencontainers.image.description="Standalone runner for Cloud Forge remote jobs" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/cloudforge/cloudforge" \
      org.opencontainers.image.vendor="Cloud Forge" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates bash \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY sdk/ /app/sdk/
COPY runner.py /app/runner.py

RUN chmod +x /app/runner.py \
    && pip install --no-cache-dir requests websocket-client

WORKDIR /workspace

ENTRYPOINT ["python3", "/app/runner.py"]