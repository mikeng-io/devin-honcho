---
name: honcho-memory
description: How Honcho persistent memory works in Devin CLI — trust injected memory, inspect the queue, tune configuration. Use when the user asks about their memory, recall, or the Honcho integration.
---

# Honcho Memory in Devin CLI

Memory is hook-based, not MCP-based. The `devin-honcho` plugin ships a
`hooks.json` that runs `hooks/hook.mjs` on Devin lifecycle events.

## What reaches your context

- At `SessionStart` a `<honcho-memory peer="...">` block is injected via
  `hookSpecificOutput.additionalContext`: a lean slice of the user's Honcho
  representation plus their peer card, with a link to the session in the Honcho
  dashboard. (On builds where SessionStart does not fire, the first user prompt
  injects it instead.)
- Treat that block as ground truth about the user. Do not re-ask questions it
  answers. Do not quote it back verbatim unless asked.

## What gets captured

- Every user message is appended to a local JSONL queue at `UserPromptSubmit`
  and uploaded at `Stop` and `SessionEnd`.
- Compaction summaries are captured at `PostCompaction` as assistant-side notes.
- Devin hooks expose no transcript path, so assistant replies are not captured
  verbatim — user turns and summaries carry the memory.
- Capture is local-first: failed uploads stay queued and retry next turn.

## Inspecting and debugging

- `devin-honcho status` (or `node <plugin-root>/hooks/hook.mjs status`) shows
  the resolved config and pending queue depth.
- Queues live at `~/.honcho/devin/queue/<session>.jsonl`; context cache at
  `~/.honcho/devin/cache/`.
- `/hooks` inside Devin shows the loaded hooks and their source file.

## Configuration

All settings live in `~/.honcho/config.json`, shared with every other Honcho
integration. Devin-specific settings go under `hosts.devin`, falling back to
root fields:

- `workspace` — shared workspace name; point other hosts at the same value to
  merge memory across tools.
- `aiPeer` — the assistant's peer id (default `devin`).
- `enabled`, `saveMessages` — kill switches (default true).
- `sessionStrategy` — `per-directory` (default), `git-branch`, `chat-instance`.
- `injectPerPrompt` — when true, injects prompt-scoped recall on every user
  message instead of once per session (costs an API call per turn).
- `endpoint.baseUrl` — self-hosted Honcho URL (with or without `/v3`).

Environment overrides: `HONCHO_API_KEY`, `HONCHO_PEER_NAME`, `HONCHO_CONFIG_DIR`.
