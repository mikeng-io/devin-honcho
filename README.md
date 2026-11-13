# devin-honcho

Persistent memory for [Devin CLI](https://docs.devin.ai/cli), built on [Honcho](https://honcho.dev).

> **Unofficial community plugin** — a custom integration by [mikeng-io](https://github.com/mikeng-io), not affiliated with or endorsed by Plastic Labs (the makers of Honcho).

A native Devin **plugin** (`.devin-plugin/plugin.json` + `hooks.json`) — lifecycle hooks capture your turns to Honcho and inject relevant context back at session start. No MCP server required. Modeled on the official [codex-honcho](https://github.com/plastic-labs/codex-honcho) and [claude-honcho](https://github.com/plastic-labs/claude-honcho) plugins, sharing the same `~/.honcho/config.json`.

## What You Get

- **Persistent Memory** — Devin remembers your preferences, projects, and context across sessions
- **Cross-Tool Context** — shares `~/.honcho/config.json` with the Claude Code, Codex, Kimi Code CLI, and DeepSeek Harness integrations; point them at the same `workspace` for one shared memory
- **Local-First Capture** — user turns queue to disk instantly and upload at turn end; failures stay queued and retry
- **Compaction-Aware** — compaction summaries are captured too, so long sessions don't lose their thread
- **Zero Dependencies** — the hooks are plain Node (>= 18), no SDK install needed

## Prerequisites

- Devin CLI with plugin + hook support (`devin plugins`, `/hooks`)
- Node >= 18 on your `PATH`
- A Honcho API key from [app.honcho.dev](https://app.honcho.dev), or a self-hosted Honcho

## Quick Start

### Step 1: Save your API key

Your key lives in `~/.honcho/config.json` — the single file every Honcho integration reads. Already using claude-honcho or codex-honcho? Nothing to do. Otherwise:

```
honcho init   # uv tool install honcho-cli if you don't have the CLI
```

### Step 2: Seed config and stage the hooks

No git clone needed — bootstrap straight from GitHub:

```
npx github:mikeng-io/devin-honcho install
```

(From a local checkout, `node bin/devin-honcho.mjs install` does the same.)

This seeds `hosts.devin` in `~/.honcho/config.json` and stages the hook bundle at `~/.honcho/devin/stage/`. The committed `hooks.json` references the staged bundle through portable `~/` paths, so the same file works on every machine. Devin does **not** resolve `./` hook commands against the plugin root (verified: relative commands silently never run), which is why the staging step exists.

### Step 3: Install the plugin

```
devin plugins install mikeng-io/devin-honcho
```

(From a local checkout: `devin plugins install --local /path/to/devin-honcho`.)

### Step 4: Start a new session

Memory loads into context at session start. Verify with `devin plugins info devin-honcho` (hooks listed) and `/hooks` inside a session.

## Commands

| Command | Effect |
| - | - |
| `devin-honcho install` | Seed `hosts.devin`, stage hooks, rewrite `hooks.json`, print install line |
| `devin-honcho status` | Resolved config, pending queue depth, Devin plugin list |
| `devin-honcho remove` | Print plugin removal instructions |

## Configuration

All settings live in `~/.honcho/config.json`. Devin-specific settings go under `hosts.devin`, falling back to root fields (same resolution as `hosts.codex`):

| Field | Default | Meaning |
| - | - | - |
| `workspace` | `"devin"` | Shared workspace; set the same value on other hosts to merge memory |
| `aiPeer` | `"devin"` | Assistant peer id |
| `enabled` / `saveMessages` | `true` | Kill switches |
| `sessionStrategy` | `per-directory` | `per-directory`, `git-branch`, or `chat-instance` |
| `injectPerPrompt` | `false` | Inject prompt-scoped recall every turn (one API call per turn) |
| `endpoint.baseUrl` | Honcho cloud | Self-hosted URL, with or without `/v3` |

Environment overrides: `HONCHO_API_KEY`, `HONCHO_PEER_NAME`, `HONCHO_CONFIG_DIR`. An explicit `sessions[cwd]` mapping pins a directory to a session name.

### Official Honcho cloud vs. self-hosted

Setup is **per machine**, in `~/.honcho/config.json` — never in this repo. Both backends work:

- **Official Honcho cloud** (default): `honcho init` with a key from [app.honcho.dev](https://app.honcho.dev). No endpoint config needed; the plugin defaults to `https://api.honcho.dev`.
- **Self-hosted Honcho**: set `endpoint.baseUrl` (root or `hosts.devin`) to your server, with or without `/v3`:

  ```json
  { "endpoint": { "baseUrl": "http://localhost:8000" } }
  ```

To merge memory with your other tools, also set the same `workspace` and `peerName` in each host block.

## How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Devin CLI                               │
├──────────────────────────────────────────────────────────────────────┤
│  SessionStart  │  UserPromptSubmit │  Stop / SessionEnd │ PostCompaction│
│  ───────────   │  ──────────────── │  ───────────────── │ ───────────── │
│  recall:       │  prompt:          │  flush:            │ compact:      │
│  materialize   │  capture the user │  upload the queue  │ capture the   │
│  the session,  │  turn locally,    │  to Honcho         │ summary +     │
│  inject memory │  fallback inject  │                    │ flush         │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
          ~/.honcho/devin/queue/<session>.jsonl  (append-only, local-first)
                              │
                              ▼
                       Honcho API  →  Persistent Memory
```

- **SessionStart** (`recall`) — creates/materializes the Honcho session and peers and injects the `<honcho-memory>` block via `hookSpecificOutput.additionalContext`.
- **UserPromptSubmit** (`prompt`) — captures the user's message to the local queue (no network). If SessionStart did not inject, injects the memory block once here instead. With `injectPerPrompt: true`, runs prompt-scoped recall every turn.
- **Stop / SessionEnd** (`flush`) — uploads queued turns to Honcho.
- **PostCompaction** (`compact`) — captures the compaction summary as an assistant-side note, then flushes.

**Known limitation:** Devin hooks expose no transcript path and `Stop` carries only `stop_hook_active`, so assistant replies are not captured verbatim. User turns and compaction summaries carry the memory; Honcho's deriver models you from those.

The plugin declares `"platforms": ["local"]` — cloud Devin sessions run on Cognition's machines and cannot reach your local Honcho config or queue.

Inspect the local queue with `tail -f ~/.honcho/devin/queue/*.jsonl`; `devin-honcho status` shows pending depth.

## What Install Writes

| Path | Change |
| - | - |
| `~/.honcho/config.json` | Seeds `hosts.devin` (existing blocks untouched) |
| `~/.honcho/devin/stage/hook.mjs` | Staged hook bundle the plugin hooks execute |
| `hooks.json` (repo) | Unchanged — already points at `~/.honcho/devin/stage/` |

`devin plugins remove devin-honcho --local` reverses the plugin; local queues stay until you delete `~/.honcho/devin/`.

## Layout

```
.devin-plugin/plugin.json   manifest (local platform only)
AGENTS.md                   always-on memory directives (plugin rule)
hooks.json                  lifecycle hook registrations (portable ~/ staged paths)
hooks/hook.mjs              recall · prompt · flush · compact · status (zero deps)
bin/devin-honcho.mjs        CLI: install · status · remove · <hook verb>
skills/honcho-memory/       memory usage guidance for the model
```

## License

MIT — see LICENSE. Adapted from [plastic-labs/codex-honcho](https://github.com/plastic-labs/codex-honcho) (MIT).

## Links

- **Honcho**: [honcho.dev](https://honcho.dev)
- **Devin CLI plugins**: [docs](https://docs.devin.ai/cli/extensibility/plugins/overview)
- **Devin CLI hooks**: [docs](https://docs.devin.ai/cli/extensibility/hooks)
