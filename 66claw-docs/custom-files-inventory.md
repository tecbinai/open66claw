# 66claw Custom File Inventory

This document lists local files and directories that are not part of upstream OpenClaw, or that should be treated as 66claw-owned during upstream merges.

## Custom Directories

| Path | Ownership |
| --- | --- |
| `ui-cn/` | 66claw Chinese UI, built with Vite/LitElement. |
| `apps/desktop/` | 66claw desktop shell and release packaging adaptations. |
| `extensions/cn-adapter/` | 66claw China adapter: setup flow, marketplace bridge, provider defaults, model capability matrix, and UI bridge RPC. |
| `extensions/feishu-cn-enhance/` | 66claw Feishu enhancement extension. |
| `66claw-docs/` | 66claw project notes and merge-boundary documentation. |

## Custom Root Files

| Path | Ownership |
| --- | --- |
| `install-cn.sh` | 66claw Linux/macOS install script. |
| `install-cn.ps1` | 66claw Windows install script. |
| `upgrade-cn.sh` | 66claw Linux/macOS upgrade script. |
| `upgrade-cn.ps1` | 66claw Windows upgrade script. |
| `openclaw.podman.env` | 66claw Podman deployment environment file. |

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
