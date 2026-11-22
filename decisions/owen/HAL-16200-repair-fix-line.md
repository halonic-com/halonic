# Decision: Settings shows three sandbox reasons as Not available, not Needs repair

- Approval: Paperclip task HAL-16200, Liam's yes on HAL-16186 (22 Nov); Liam signs this note in review on HAL-16200
- Kind: user-visible

Settings › Agent sandbox showed `setup-conflict`, `distro-missing` and
`runtime-missing` as Needs repair, with a **Repair the sandbox** button. That
button runs the same setup as **Set up the sandbox**: srt's own Windows
install. It can't fix any of the three:

- `setup-conflict`: another program installed srt's filters with a different
  loopback mode, and srt's install refuses to replace them unless forced.
  Halonic never forces it, so the repair fails.
- `distro-missing` and `runtime-missing`: the repair never touches Halonic's
  WSL distro. The code that imports it and installs its runtime isn't wired
  into Studio.

A button that can't work is worse than none. Now the three reach the section
as their code, like every other reason the person or an administrator fixes
outside Halonic: Not available, the catalogue's reason, **Check again**, the
docs link and the way round it. The CLI keeps "Use Halonic inside WSL 2" for
all three (HAL-16186). A real repair for any of them, such as the WSL setup
in Studio, would be its own task.

The requirement changes only in this:

- `studio.agent-sandbox-host`: "a sandbox that is set up but part missing or
  wrong is Needs repair" is gone; the three codes are named among the reasons
  that reach the section as their code. One example and the source are added.

No test is removed or skipped. In `apps/studio`'s host test, the three rows
that read these codes as `needs-repair` now get one test each that checks the
whole answer (`unavailable` with the code), in place of the one test that
checked `distro-missing`'s repair sentence.

## Covers

- studio.agent-sandbox-host
- apps/studio/src/studio/agent-sandbox-host.test.ts
