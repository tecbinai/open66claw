# 66claw Custom File Inventory

This document lists local files and directories that are not part of upstream OpenClaw, or that should be treated as 66claw-owned during upstream merges.

## Custom Directories

| Path | Ownership |
| --- | --- |
| `ui-cn/` | 66claw Chinese UI, built with Vite/LitElement. |
| `apps/desktop/` | 66claw desktop shell and release packaging adaptations. |
| `extensions/cn-adapter/` | 66claw China adapter: setup flow, marketplace bridge, provider defaults, model capability matrix, and UI bridge RPC. |
| `extensions/feishu-cn-enhance/` | 66claw Feishu enhancement extension. |
| `docs/66claw/` | 66claw project notes and merge-boundary documentation. |

## Custom Root Files

No 66claw-owned installation or deployment helper scripts should live in the repository root. Keep product-specific tooling under `scripts/`, `deploy/`, or `docs/66claw/` when it is intentionally retained.

## Upstream Files With Local Changes

These files originate from upstream OpenClaw but contain local changes. Review them carefully during upstream merges:

| Path | Local responsibility |
| --- | --- |
| `package.json` | 66claw build/dev scripts and `ui-cn` build integration. |
| `src/cli/profile.ts` | Local CLI behavior changes. |
| `src/cli/gateway-cli/run.ts` | Local gateway behavior changes. |
| `src/cli/command-format.ts` | Local CLI parsing changes. |
| `src/cli/program/help.ts` | Local CLI help changes. |
| `src/infra/cli-root-options.ts` | Local root option changes. |
| `docs/` | Some documentation files include local Chinese user/developer material. |
