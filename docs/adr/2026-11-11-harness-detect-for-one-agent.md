# A harness's detect() can answer for one agent

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Claude Code and Codex keep their sign-in in a settings folder:
`CLAUDE_CONFIG_DIR` and `CODEX_HOME`. Each agent's runs get a settings
folder of their own (D43), so a tricked agent can leak only its own
sign-in, and only to its provider. The person's own sign-in is never copied
there.

`detect()` asked `claude auth status` and `codex login status` through
`ProgramProbe`, which passes only `PATH`, `HOME` and the locale. So the
programs answered about the person's own folder (`~/.claude`, `~/.codex`).
A person signed in there saw "ready", and the agent's run then found no
sign-in in its own folder and ended as `harness-start-failed`. That is the
case the [signed-out ADR](2026-11-09-harness-signed-out.md) was written to
stop. It was found in the 11 Nov code review (HAL-5216). On macOS, Claude
Code keeps one keychain entry per settings folder, so the same holds there
(checked on HAL-5354).

## Decision

**`detect()` takes an optional `settingsFolder`.** It is the folder that
agent's runs get. With it, the adapter asks its program about that folder's
sign-in. Without it, `detect()` checks the program and the person's own
sign-in, as before, which is what `halonic doctor` shows outside an agent.

**`ProgramProbe.ask` takes an optional question with one settings folder:**
the variable that points the program at it, and the folder. The Node probe
sets only that variable on top of `PATH`, `HOME` and the locale, and knows
the variables by name (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`). A question with
any other variable, or a folder that isn't absolute, is `failed` and starts
nothing. So this is no general door for extra environment variables. Every
other variable of the launcher stays out, `CLAUDE_SECURESTORAGE_CONFIG_DIR`
(which would pick another keychain entry) included.

**Versions: `Harness` 2 → 3 and `ProgramProbe` 1 → 2.** Both are new
optional inputs the adapter must honour. An old adapter would ignore them
and answer about the wrong folder, so under the port freeze
([port list and versions](2026-11-07-port-list-and-versions.md)) they are
breaking. The two program adapters, the agent host's stand-in and its
route, the Node probe and the port tests change in the same change. The
built-in loop and the test harnesses have no sign-in, so they ignore the
option and stay right.

## Consequences

- A caller that knows the agent, such as Studio's agent screen or a run's
  readiness check, passes the agent's settings folder. Where that folder is
  comes from the host's profile builder (HAL-4790).
- With an honest check, every subscription agent says "not signed in"
  until someone signs in for it. The "Sign in for this agent" step in
  Studio (HAL-5395) and the sign-in command in `halonic doctor` give the
  way to do that.
- `ready` still means "a sign-in is stored". A sign-in that has expired at
  the provider shows only on the first model call, as before.
