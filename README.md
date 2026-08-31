# pi-seatbelt

Pi extension that runs **every built-in FS/exec tool** through [`@anthropic-ai/sandbox-runtime`](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime) (`sandbox-exec` on macOS, bubblewrap on Linux).

This **is** the Anthropic sandbox-runtime wrapper — not a JS path gate. OS policy is the boundary.

Covered tools: `bash`, `user_bash` (`!` commands), `read`, `write`, `edit`, `ls`, `grep` (ripgrep only), `find` (`fd`).

MCP and other extension tools are out of scope.

## Default policy

Writes default-deny except:

- `/Users/greg/Dev/git` (hardcoded product root, including `*-wt` worktrees)
- `/tmp`, `/private/tmp`, `/var/folders`
- `$HOME/Library/Caches`, `$HOME/.cache`, `$HOME/.npm`, `$HOME/.pnpm-store`, `$HOME/.yarn`, `$HOME/.cargo`, `$HOME/.rustup`, `$HOME/.local/share`

`/Users/greg/orchestrator`, `$HOME`, and `$HOME/Documents` are **not** writable.

Credential reads denied: `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.netrc`, `~/.config/gh`.

Network: `allowedDomains: ["*"]`, `allowLocalBinding: true`.

## Usage

```bash
pi -e ./src              # seatbelt enabled (darwin/linux)
pi -e ./src --no-sandbox # skip initialize; tools run unsandboxed
```

Slash command `/seatbelt` prints allowWrite / denyRead / network.

If `SandboxManager.initialize` throws, tools are left unsandboxed and a notification is shown.

## Install

Pin `@anthropic-ai/sandbox-runtime@0.0.74`. Peer: `@earendil-works/pi-coding-agent`.

```bash
npm test
```
