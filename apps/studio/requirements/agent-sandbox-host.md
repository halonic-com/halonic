# studio.agent-sandbox-host

- Status: active
- Since: 0.1.0
- Source: HAL-8034 (S1 part 2, HAL-1451); ux-checklists-s1-s2 1.1 to 1.4 (HAL-1444)

The Studio app shall read Settings › Agent sandbox from the agent host's check: a passing check is Ready, `setup-needed` is Needs setting up, a sandbox that is set up but part missing or wrong is Needs repair, and any other reason is a sentence the section shows with **Check again**. A setup or removal shall start only when the section asks, and its end shall reach the section as nothing when it worked, or as the sentence why it didn't. A build that doesn't offer the sandbox (D44 c) shall give the section no host, so it reads Not available.

## Examples

- Given the host's check says `setup-needed`,
  when the section reads it,
  then the state is Needs setting up.
- Given the host's removal answers that 2 runs use the sandbox,
  when the section asks to remove,
  then the result says 2 runs, and no administrator prompt came up.
