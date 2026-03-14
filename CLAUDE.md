# Claude Code Project Instructions

## Bash Command Permissions

All bash commands are pre-approved. Run all shell commands without requesting confirmation. Do not prompt for approval on any `Bash` tool call.

## Primary Reference

All domain rules, schema definitions, QA protocols, and operational instructions live in **`agents.md`** at the repo root. Read it before starting any work. This file (`CLAUDE.md`) only covers Claude Code-specific behavior.

## Claude-Specific Behavior

- **Do not ask for confirmation before running commands.** If the task requires `npm install`, `git commit`, `grep`, file reads, or any other shell command, just run it.
- **Do not summarize what you "would" do.** Execute the work, then report what you did.
- **Do not declare work complete without running the QA protocol in `agents.md`.** If you skip QA, say so explicitly and explain why.
- **After every file edit, re-read the file at the edited lines** using `cat -n`, `sed -n`, or equivalent. Claude Code edits silently fail (wrong string match, duplicate text, partial apply) more often than you expect. Verify the file reflects your intent before moving on.
- **Trace through logic changes with concrete values.** Do not rely on "this looks right" — substitute actual numbers and walk through the code path.
- **After self-QA passes, spawn a Sonnet QA agent in the foreground.** Use the Agent tool (`subagent_type: "general-purpose"`, `model: "sonnet"`) — do NOT set `run_in_background`. The user wants to watch the QA agent work. Write a self-contained prompt that includes: context of what changed, commands to run all automated gates with expected pass counts, exact `grep` commands per issue with expected output, cross-cutting checks (bundle size, dead imports, data flow), and a request for a pass/fail table. The QA agent must only read and run checks — it must NOT edit files. If it finds failures, report them and decide how to act.
