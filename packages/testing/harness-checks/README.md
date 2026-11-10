# @halonicjs/testing-harness-checks

Manual checks of how the coding-agent harnesses sign in when they run behind Halonic's bridge and sandbox. A person runs them by hand on their own computer, with their own subscription; CI runs only the package's tests, with made-up tokens. They answer checks 1 and 2 of HAL-1710 ([harness checks](/HAL/issues/HAL-194#document-harness-checks)).

- **Layer:** testing
- **Owner:** owen
- **Public API:** `@halonicjs/testing-harness-checks`

## What the Claude Code check does

It opens the run's real bridge, set up for a subscription, puts a small "tap" in front of it, and opens an srt sandbox whose only reachable address is that tap. Claude Code gets the variables its adapter gives it (`ANTHROPIC_BASE_URL`, `ANTHROPIC_CUSTOM_HEADERS`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_TMPDIR`), a home folder of its own, and nothing else from your environment. Then it:

1. Looks for the sign-in: is `.credentials.json` in the settings folder, and (on macOS) which Keychain entries are named "Claude Code…". It reads neither.
2. Asks `claude auth status`, outside the sandbox and inside it: signed in, yes or no.
3. Sends one short prompt (`claude -p`) inside the sandbox and notes which requests reached the bridge, whether each carried `authorization`, `x-api-key` and the bridge's run token header, what the bridge answered, and which hosts the sandbox refused.
4. With `--expire-sign-in`: copies the settings folder, sets the sign-in's expiry in the copy a minute in the past, and sends the prompt again, so Claude Code refreshes first. The report says where the refresh went. The copy is deleted at the end.

It prints a Markdown table to paste into HAL-1710, with a verdict for the sign-in path and the refresh path: **through the bridge**, or **needs provider hosts in `allowedSites`** with the hosts.

### What it never prints

No header value, token, account name or anything Claude Code printed. The report holds header names with "present" or "absent", paths, hosts, status codes, exit codes and counts. Claude Code's answers are read in memory for one fact each (`loggedIn`, `is_error`, its sign-in message) and dropped.

## Running it

You need a clone of this repo with `pnpm install` done, Claude Code installed, and a computer where srt runs (macOS, or Linux with bubblewrap; not inside a container).

1. Make a settings folder for the check and sign in to it with your subscription. Use a folder of its own, not `~/.claude`:

   ```sh
   mkdir -p ~/halonic-check/claude
   CLAUDE_CONFIG_DIR=~/halonic-check/claude claude auth login
   ```

2. From the repo root, run the check:

   ```sh
   node packages/testing/harness-checks/src/cli/claude-code.ts --settings-folder ~/halonic-check/claude
   ```

3. To see where a token refresh goes, run it again with `--expire-sign-in`. This works only when the sign-in is in `.credentials.json` (always on Linux). On macOS, when the sign-in is in the Keychain, the report says the refresh couldn't be forced.

   The expired copy still holds the folder's real refresh token. If a refresh gets through, the provider rotates that token, and the one left in `~/halonic-check/claude` may stop working. Run `CLAUDE_CONFIG_DIR=~/halonic-check/claude claude auth login` again before the next check.

4. On macOS, if the sign-in went to the Keychain and Claude Code can't read it inside srt, try the long-lived token instead. `claude setup-token` prints it once; put it in your shell without it landing in the history, then pass it in:

   ```sh
   CLAUDE_CONFIG_DIR=~/halonic-check/claude claude setup-token
   read -rs CLAUDE_CODE_OAUTH_TOKEN && export CLAUDE_CODE_OAUTH_TOKEN   # paste the token, then Enter
   node packages/testing/harness-checks/src/cli/claude-code.ts --settings-folder ~/halonic-check/claude --use-oauth-token
   unset CLAUDE_CODE_OAUTH_TOKEN
   ```

5. Paste each report into HAL-1710 as it is.

`--timeout-seconds <n>` sets how long one prompt may take (default 180). A prompt whose network is refused can retry for a while before it gives up.

### Reading the report

- **Sign-in path: through the bridge.** The prompt was answered, and a model call carrying a sign-in reached the bridge and was answered. Hosts listed as refused in that same run weren't needed (Claude Code also tries telemetry and update hosts).
- **Needs provider hosts in `allowedSites`.** The prompt failed and the sandbox refused the hosts listed. Those are the candidates for that agent's `allowedSites`.
- **Inconclusive.** The reason is given, for example "the requests reached the bridge without a sign-in".

The refused hosts come from srt's own debug log, which the check turns on for the sandbox's launcher only.

## Building blocks

The command is built from parts a later check (Codex, HAL-4475 D4) reuses:

- `openBridgeSandbox`: the run's real bridge set up for a subscription, a header tap in front of it, and an srt sandbox that reaches only the tap.
- `openHeaderTap`: passes requests on to the bridge unchanged and keeps only the method, the path, the status and whether each watched header was sent. Never a value.
- `deniedHostsRunner`: reads the hosts the sandbox refused from srt's debug log, which it turns on for the launcher only.
- `claudeSignInStorage`: whether Claude Code's `.credentials.json` is in a settings folder, and on macOS which Keychain entries are named "Claude Code…". It opens neither.

## Example

```ts
import { claudeCodeEnvironment } from "@halonicjs/adapter-harness-claude-code";
import { openBridgeSandbox } from "@halonicjs/testing-harness-checks";

const sandbox = await openBridgeSandbox({
  provider: "anthropic",
  watched: ["authorization", "x-api-key"],
  environment: claudeCodeEnvironment,
  settingsFolder,
  scratchFolder,
  allowedSites: [],
});
try {
  const run = await sandbox.run({ program: "claude", args: ["auth", "status"] }, 60_000);
  console.log(run.exit.code, sandbox.requests, sandbox.denied);
} finally {
  await sandbox.close();
}
```
