#!/usr/bin/env node
/**
 * devin-honcho CLI: install · status · remove · recall | prompt | flush | compact
 *
 * install seeds hosts.devin in ~/.honcho/config.json (shared with the other
 * Honcho integrations), stages the hook bundle to ~/.honcho/devin/stage/ (so
 * hooks survive repo moves), rewrites hooks.json with absolute staged paths,
 * and prints the `devin plugins install` line. Hook verbs forward to
 * hooks/hook.mjs with stdin attached.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "hook.mjs");
const HONCHO_DIR = process.env.HONCHO_CONFIG_DIR || join(homedir(), ".honcho");
const verb = process.argv[2] || "status";

if (["recall", "prompt", "flush", "compact"].includes(verb)) {
  const r = spawnSync(process.execPath, [HOOK, verb], { stdio: "inherit" });
  process.exit(r.status ?? 0);
}

if (verb === "install") {
  const p = join(HONCHO_DIR, "config.json");
  let j = {};
  try {
    j = JSON.parse(readFileSync(p, "utf8"));
  } catch {}
  const key = process.env.HONCHO_API_KEY || j.apiKey || j.hosts?.devin?.apiKey;
  if (!key) {
    console.error("No Honcho API key found. Run `honcho init` (uv tool install honcho-cli) first.");
    process.exit(1);
  }
  j.hosts = j.hosts || {};
  if (!j.hosts.devin) {
    j.hosts.devin = {
      workspace: j.hosts.codex?.workspace ?? j.hosts.claude_code?.workspace ?? j.workspace ?? "devin",
      enabled: true,
      saveMessages: true,
      reasoningLevel: "low",
      ...(j.hosts.codex?.endpoint ?? j.endpoint ? { endpoint: j.hosts.codex?.endpoint ?? j.endpoint } : {}),
      aiPeer: "devin",
      sessionStrategy: "per-directory",
      injectPerPrompt: false,
    };
    writeFileSync(p, JSON.stringify(j, null, 2) + "\n", { mode: 0o600 });
    console.log(`Seeded hosts.devin in ${p} (workspace=${j.hosts.devin.workspace})`);
  }

  // Stage the hook bundle so plugin hooks keep working if the repo moves
  const stage = join(HONCHO_DIR, "devin", "stage");
  mkdirSync(stage, { recursive: true });
  copyFileSync(HOOK, join(stage, "hook.mjs"));

  // Devin does not guarantee plugin-hook cwd; use absolute staged paths
  const staged = join(stage, "hook.mjs");
  const hooksJson = {
    SessionStart: [{ matcher: "", hooks: [{ type: "command", command: `node ${staged} recall`, timeout: 20 }] }],
    UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: `node ${staged} prompt`, timeout: 10 }] }],
    Stop: [{ matcher: "", hooks: [{ type: "command", command: `node ${staged} flush`, timeout: 20 }] }],
    PostCompaction: [{ matcher: "", hooks: [{ type: "command", command: `node ${staged} compact`, timeout: 20 }] }],
    SessionEnd: [{ matcher: "", hooks: [{ type: "command", command: `node ${staged} flush`, timeout: 20 }] }],
  };
  writeFileSync(join(ROOT, "hooks.json"), JSON.stringify(hooksJson, null, 2) + "\n");
  console.log(`Staged hooks at ${staged}; hooks.json rewritten with absolute paths`);

  console.log(`\nInstall the plugin:\n\n  devin plugins install --local ${ROOT}\n`);
  console.log("Then start a new Devin session. Verify with `devin plugins info devin-honcho` and `/hooks`.");
} else if (verb === "status") {
  const r = spawnSync(process.execPath, [HOOK, "status"], { stdio: "inherit" });
  console.log("\nDevin plugin state (run `devin plugins info devin-honcho` for details):");
  spawnSync("devin", ["plugins", "list"], { stdio: "inherit" });
  process.exit(r.status ?? 0);
} else if (verb === "remove") {
  console.log("Run:\n\n  devin plugins remove devin-honcho --local\n");
  console.log("Local queues at ~/.honcho/devin/ are kept; delete them manually if unwanted.");
} else {
  console.log("Usage: devin-honcho install | status | remove | recall | prompt | flush | compact");
  process.exit(verb === "help" || verb === "--help" ? 0 : 1);
}
