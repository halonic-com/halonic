# Decision: Windows Studio offers Settings › Agent sandbox

- Approval: Paperclip task HAL-16772, the board's yes to D44 on Windows (23 Nov, 10:38 UTC); task HAL-17029
- Kind: user-visible

The board said yes to D44 on Windows on HAL-16772: Settings › Agent sandbox,
with its setup, repair and removal, is turned on in Windows builds. The flip
was meant for #5419, but it came after that pull request was approved, so on
`main` the switch `agentSandboxOffered` was still `false` and no build showed
the section's **Set up** button.

The switch becomes `agentSandboxOffered(platform)`, true only on Windows. The
board answered only for Windows, so on macOS and Linux the section still
reads Not available. Studio passes the platform it already reads from the
page's user agent.

The test changes only in this:

- `the build › doesn't offer the sandbox until the board decides D44 (a)`
  in `apps/studio/src/studio/agent-sandbox-host.test.ts` becomes
  `offers the sandbox on Windows only, as the board decided D44 (HAL-16772)`:
  it checks that Windows is offered and macOS and Linux aren't.

The requirement changes only in this:

- `studio.agent-sandbox-host`: "A build that doesn't offer the sandbox (D44
  c) shall give the section no host" becomes "Studio shall offer the sandbox
  on Windows only; on any other system it shall give the section no host".
  One example and the source are added.

`decisions/elena/HAL-16771-wsl-setup-button.md` still says the switch stays
false until the board decides. It is left as it is, because changing a
signed note breaks its signature.

No test is removed, skipped or weakened beyond the one described above.

## Covers

- studio.agent-sandbox-host
- apps/studio/src/studio/agent-sandbox-host.test.ts
