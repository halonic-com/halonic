# studio.agent-sandbox-host

- Status: active
- Since: unreleased
- Source: HAL-8034 (S1 part 2, HAL-1451); ux-checklists-s1-s2 1.1 to 1.4 (HAL-1444); HAL-4295 (HAL-13194); HAL-16200; HAL-16771 (HAL-16765 PR 2); HAL-17029 (D44 on Windows, HAL-16772)

The Studio app shall read Settings › Agent sandbox from the agent host's check: a passing check is Ready, `setup-needed` is Needs setting up, and so is `distro-missing` where the shell runs the WSL setup (`studio.sandbox-wsl-setup-through-shell`); any other reason, `setup-conflict`, `runtime-missing` and `distro-missing` elsewhere included, reaches the section as its code, which the section words from the sandbox-start catalogue with **Check again**. A host the shell couldn't start for a sandbox reason, such as `distro-missing`, shall be read as a check that gave that reason. The check's own sentence shall never reach the section. A setup or removal shall start only when the section asks, and its end shall reach the section as nothing when it worked, or as the sentence why it didn't. Studio shall offer the sandbox on Windows only (D44, HAL-16772); on any other system it shall give the section no host, so it reads Not available. The host shall report whether the Studio's runs start an agent outside its sandbox, the same answer the Harness page gets.

## Examples

- Given the host's check says `setup-needed`,
  when the section reads it,
  then the state is Needs setting up.
- Given the shell couldn't start the host because Halonic's distro is missing, and the shell runs the WSL setup,
  when the section reads the check,
  then the state is Needs setting up.
- Given the shell couldn't start the host because the distro has no runtime,
  when the section reads the check,
  then it gets the code `runtime-missing`.
- Given the host's check says `setup-conflict`,
  when the section reads it,
  then it gets the code `setup-conflict` and no Needs repair, since the repair can't replace another program's setup.
- Given the host's removal answers that 2 runs use the sandbox,
  when the section asks to remove,
  then the result says 2 runs, and no administrator prompt came up.
- Given the host's check says `other` and names what is missing in its own sentence,
  when the section reads it,
  then it gets the code `other` and not the sentence.
- Given the Studio's runs can't start an agent outside its sandbox,
  when the section asks the host,
  then the host says so, as the Harness page is told.
- Given an agent host that opens sessions on this computer,
  when the section asks the host,
  then the host says the Studio's runs start an agent outside its sandbox, as the Harness page is told.
- Given Studio runs on macOS or Linux,
  when a folder opens,
  then the section gets no host and reads Not available.
