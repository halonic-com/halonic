# studio.agent-sandbox-host

- Status: active
- Since: unreleased
- Source: HAL-8034 (S1 part 2, HAL-1451); ux-checklists-s1-s2 1.1 to 1.4 (HAL-1444); HAL-4295 (HAL-13194)

The Studio app shall read Settings › Agent sandbox from the agent host's check: a passing check is Ready, `setup-needed` is Needs setting up, a sandbox that is set up but part missing or wrong is Needs repair, and any other reason reaches the section as its code, which the section words from the sandbox-start catalogue with **Check again**. The check's own sentence shall never reach the section. A setup or removal shall start only when the section asks, and its end shall reach the section as nothing when it worked, or as the sentence why it didn't. A build that doesn't offer the sandbox (D44 c) shall give the section no host, so it reads Not available. The host shall report whether the Studio's runs start an agent outside its sandbox, the same answer the Harness page gets.

## Examples

- Given the host's check says `setup-needed`,
  when the section reads it,
  then the state is Needs setting up.
- Given the host's removal answers that 2 runs use the sandbox,
  when the section asks to remove,
  then the result says 2 runs, and no administrator prompt came up.
- Given the host's check says `other` and names what is missing in its own sentence,
  when the section reads it,
  then it gets the code `other` and not the sentence.
- Given the Studio's runs can't start an agent outside its sandbox,
  when the section asks the host,
  then the host says so, as the Harness page is told.
