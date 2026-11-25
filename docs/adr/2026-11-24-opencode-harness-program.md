# OpenCode is an approved harness program, at one exact version

- **Status:** Accepted (Liam, plan review on HAL-16826, 23 Nov; the board agreed on the same task)
- **Date:** 2026-11-24
- **Author:** Owen. **Reviewer:** Liam.

## Context

In the model-mix trials, OpenCode 2.3.0 with DeepSeek V4.1 Flash solved 9 of 10
hard tasks at about $0.03 per task, and a blind grader ranked its work second
only to Opus. Halonic already runs Claude Code and Codex as harness programs
behind its own sandbox and bridge. Section 7 of the HAL-1 plan has no list of
harness programs, so this note is the record that OpenCode is one. We looked at
building the same loop ourselves and chose not to: it already exists.

OpenCode is a fast-moving program with network features of its own (a models
list fetch, auto-updates, sharing, a background service). Every version can add
one, so the approval is for an exact version, not a range.

## Decision

- **OpenCode is an approved harness program.** An agent's file may say
  `harness: opencode`. The adapter (`@halonicjs/adapter-harness-opencode`)
  follows the harness port like the Claude Code and Codex adapters: model calls
  go through Halonic's bridge, keys and spend stay outside the sandbox.
- **Exact version.** The adapter holds a list of tested versions (today only
  `2.3.0`) and refuses any other with a reason that names the version to
  install. This is stricter than Claude Code and Codex on purpose. The test
  devDependency and the runner image pin the official platform binary package
  (`@opencode/cli-linux-x64`) exactly, with its integrity hash, installed with
  `--ignore-scripts`.
- **No auto-updates anywhere.** The adapter sets `update: "disable"` and
  `OPENCODE_DISABLE_AUTOUPDATE=1`. Dependabot ignores `@opencode/*`
  (`.github/dependabot.yml`).
- **v1 runs only on Linux, only inside a proven fence** (`asks: in-sandbox`),
  always with `--standalone`. Elsewhere the harness refuses to start.
- **One fixed instruction line.** The adapter puts this line in front of the
  agent's pinned instructions, as harness parity with Claude Code's own prompt,
  not as part of the agent's instructions. A fingerprint check that finds it
  in a request is explained by this note:

  > Work in few steps. When several tool calls don't depend on each other (reads, searches), make them all in the same step, in parallel.

## Version-bump checklist

A version bump is its own security pull request, reviewed by Liam, and its body
must have:

1. **Egress test green on the new version:** the test that runs OpenCode in the
   Linux sandbox against a scripted bridge, with a recorder that refuses
   everything but the bridge, sees zero other attempts, and sees
   `models.opencode.ai` in its negative control.
2. **The config diff:** the output of
   `pnpm --filter @halonicjs/tooling-opencode-diff diff <old> <new>`, which lists,
   between the old and the new version, every `OPENCODE_*` environment name in the
   shipped code and every key of the config schema, so new network features or
   renamed flags show up. It also prints the new program package's integrity,
   which goes into the sandbox fence job's `OPENCODE_INTEGRITY` with the version.
3. **An eval smoke:** 1–2 hard-v2 tasks on the trial server with the new
   version, linked in the pull request.

The marker test (no working-folder `AGENTS.md`, `CLAUDE.md` or project agent
reaches the model) and the exact tool-list test run on every bump too.

## Consequences

- The `harness` field of an agent's file accepts `opencode`; `halonic doctor`
  reports the program as missing until the adapter lands.
- `HarnessTask.maxOutputTokens` (optional) carries the alias's
  `params.maxTokens` to a harness. The OpenCode adapter defaults to 32,000.
- Two known gaps are written in `docs/security/threat-model.md`: the run token
  is visible to OpenCode's shell tool (as with Claude Code), and its
  `opencode_worktree_remove` tool ignores its deny rule.
- Updating OpenCode costs a security review each time. That is the point.
