# Decision: Settings › Agent sandbox warns about the default distro and Docker Desktop

- Task: HAL-12445 (finding F3 of the srt-wsl security review, HAL-12434)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12512 (Liam approved the plan, PR 4: the Studio words for the two residuals); the words are a team wording decision recorded on HAL-12445, from Noah's lines on HAL-12513; Liam signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5GOIxCYwzZWZiTgnBKVfd9t/zkYPa1u/vxbhiJ7kMYvESf9uToIVi/iM5RbV7qEH5aki9GgEViQktjKKbACTAQ==

## What changes

The active requirement `settings.agent-sandbox-section` gains one sentence and one example. Next to
the overdue-updates line, the section now shows two more warning lines:

- "The agent sandbox is your default WSL distribution, so typing wsl in a terminal opens it." with
  how to change it, when the shell says `halonic` is WSL's default distro (`isDefaultDistro` in the
  `agent_host_security_updates` answer).
- "Docker Desktop is running next to the agent sandbox." with where to turn its WSL integration
  off, when the sandbox's passing check names `docker-desktop-visible`.

Each is a warning: the state, the chip and the buttons stay as they are. The default distribution
comes first, because Docker Desktop connects to the default distro by itself. When the host
doesn't say so, or can't say, neither line shows. Nothing that was there changes, and no test was
weakened or removed.

## Why

W6 of the threat model asks that the person sees both. Docker Desktop is often installed after the
setup, and the default distro can change at any time, so the shell and the check read them at each
start. The Docker line says "running next to", not "connected": `/mnt/wsl` is shared by every WSL
distro, so Docker Desktop shows there even with its integration for `halonic` off (Liam, HAL-12512).

## Covers

- settings.agent-sandbox-section
