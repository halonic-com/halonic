# Decision: Settings sets up a missing WSL distro instead of only checking again

- Approval: Paperclip task HAL-16771, PR 2 of the scope on HAL-16765 that Liam approved (23 Nov)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LWfqx958NUKzLhp3ap8qOXEp1bbxPGb/YLOGbecCE4nyHZOZq4nI+p6mxmpi7qKN2OiJpjmUYRL/uVgqLQ3xBw==

HAL-16200 made Settings › Agent sandbox show `distro-missing` as Not
available with only **Check again**, because nothing in Studio could create
Halonic's WSL distro: the only setup button ran srt's own Windows setup,
which never touches the distro. This pull request adds that missing piece.
The shell's new `sandbox_wsl_setup` runs the WSL setup from the Windows side.
So where the agent host runs in the distro, `distro-missing` is Needs
setting up again, and **Set up the sandbox** runs the WSL setup.

The shell refuses to start the host while the distro is missing, so there
is no host to ask for a check. Until now that refusal reached the section as
a check that couldn't run. Now the section reads it as a check that gave the
shell's sandbox reason (`distro-missing`, `wsl-missing`, `runtime-missing`),
which is the reason the requirement already names.

Nobody sees this yet: `agentSandboxOffered` stays false until the board
decides D44, so the section still reads Not available in every build.

The requirement changes only in this:

- `studio.agent-sandbox-host`: `distro-missing` is Needs setting up where the
  shell runs the WSL setup, and stays a code elsewhere. A host the shell
  couldn't start for a sandbox reason is read as a check with that reason.
  Two examples and the source are added.

No test is removed, skipped or weakened. The new tests are in
`apps/studio/src/studio/agent-sandbox-host.wsl-setup.test.ts`.

## Covers

- studio.agent-sandbox-host
