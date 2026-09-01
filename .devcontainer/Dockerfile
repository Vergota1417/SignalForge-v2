FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends git jq ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /workspaces/SignalForge-v2
