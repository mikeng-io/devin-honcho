# Honcho Memory

You have persistent cross-session memory via Honcho, captured through lifecycle
hooks (no MCP server involved). A `<honcho-memory>` block is injected at session
start — trust it and act on it; do not ask the user about things it already covers.

User turns are captured to Honcho automatically at turn end and at session end,
and compaction summaries are captured after compaction, so preferences,
decisions, and project context persist across sessions and across other
Honcho-connected tools (Claude Code, Codex, Kimi Code CLI, DeepSeek Harness)
that share the same workspace and peer name.

If the user asks about their memory or the Honcho setup, the `honcho-memory`
skill explains the layout, the queue, and how to inspect it.
