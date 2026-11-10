# @halonicjs/testing-harness-checks

Manual checks of how the coding-agent harnesses sign in when they run behind Halonic's bridge and sandbox. A person runs them by hand on their own computer, with their own subscription; CI runs only the package's tests, with made-up tokens. They answer checks 1 and 2 of HAL-1710 ([harness checks](/HAL/issues/HAL-194#document-harness-checks)).

- **Layer:** testing
- **Owner:** owen
- **Public API:** `@halonicjs/testing-harness-checks`

This first part holds the setup the checks share. The Claude Code check and its command come next (HAL-4475), then Codex.

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
