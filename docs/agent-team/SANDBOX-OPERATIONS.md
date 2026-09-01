# SignalForge Agent Sandbox Operations

## Goal

All autonomous or semi-autonomous coding agents should operate in a remote disposable environment rather than on the user's Windows filesystem.

Preferred execution environment: **GitHub Codespaces** using `.devcontainer/devcontainer.json`.

The sandbox exists to protect the user's PC and production systems while still allowing the agent team to build, test, commit, and open pull requests.

## Hard sandbox rules

1. Do not mount local Windows folders, drives, home directories, SSH directories, browser profiles, password stores, or cloud-sync folders into the sandbox.
2. Do not copy personal secrets into the repository or Codespace.
3. Do not add Cloudflare production credentials, brokerage credentials, financial-account credentials, production database credentials, or unrestricted API tokens to the sandbox.
4. Do not run production deployment commands from an implementation work package.
5. Do not write directly to `main`. Work only in work-package branches/worktrees.
6. Network access is for dependency installation, GitHub operations, approved public research, and explicitly approved development services only.
7. Provider-backed market-data tests should use mocks/fixtures unless the owning work package explicitly authorizes a bounded development request.
8. A sandbox may be deleted and recreated at any time. No required truth may live only inside one sandbox filesystem.
9. Every durable change must be committed to its work-package branch.
10. Production secrets are introduced only in the deployment environment after integration/release approval, never because an implementation agent asks for them.

## What the sandbox may access

- the SignalForge repository;
- its assigned branch/worktree;
- public package registries required to install dependencies;
- GitHub for branch, commit, PR, and CI operations;
- local development ports inside the remote environment;
- test fixtures and non-secret development configuration.

## What it must not access

- the user's Windows filesystem;
- personal documents/photos/downloads;
- browser cookies or saved passwords;
- local SSH keys;
- production Cloudflare secrets;
- brokerage accounts;
- personal financial accounts;
- unrestricted production databases;
- other private repositories unless separately authorized.

## Deployment separation

Implementation agents build and test. They do not deploy production.

The release flow is:

`agent work branch -> integration branch -> CI/QA -> approved release candidate -> deployment owner`

Production deployment credentials live outside ordinary work-package sandboxes.

## Sandbox identity

The dev container sets:

`SIGNALFORGE_SANDBOX=1`

Tests and future tooling may use this marker to disable or reject production-only behavior.

## Recommended user workflow

1. Open the repository on GitHub.
2. Select **Code -> Codespaces -> Create codespace**.
3. Choose the approved agent/integration branch.
4. Choose **SignalForge Agent Sandbox** when the dev-container configuration is offered.
5. Keep work in the browser or remote editor. Do not bind local Windows folders into the environment.
6. Do not add production secrets to Codespaces secrets.
7. Delete/rebuild the Codespace if its state becomes questionable.

## Defense in depth

The sandbox is one layer. Repository governance remains another layer. Agents must still obey `AGENTS.md`, work-package allowed paths, protected owners, CI, adversarial QA, and integration approval.
