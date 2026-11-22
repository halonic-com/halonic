# Decision: the CLI sends `runtime-missing` to the repair in Studio's Settings

- Approval: Paperclip task HAL-16186, from flow check C684 finding 3 on HAL-16182; Liam signs this note in review on HAL-16186
- Kind: user-visible

`runtime-missing` means Halonic Studio's own WSL distro is there but the
runtime that runs the sandbox in it isn't. Only Studio's WSL setup creates
that distro, and only Studio's repair (Settings › Agent sandbox, **Repair the
sandbox**) puts the runtime back. The CLI's fix, "Use Halonic inside WSL 2 on
this computer", sent the person nowhere that fixes it, and Studio, the CLI and
the doctor how-to each said something different.

Now all three say: open Settings › Agent sandbox and press Repair the sandbox.
The CLI puts "in Halonic Studio, " in front, because the command line has no
Settings of its own. Settings' card line for the reason says "Linux system",
the same name the CLI and Studio use, in place of "Linux part".

The other WSL setup reasons (`distro-missing`, `setup-conflict`,
`setup-needed`) keep their CLI fix "Use Halonic inside WSL 2" (HAL-7540).
This task is about `runtime-missing` only; whether they should point to Studio
too is a separate decision.

The requirements change only by narrowing one rule and adding one example:

- `cli.commands.plugin.off-here`: "so no fix points to Studio's Settings" now
  ends with "except `runtime-missing`'s, which only Studio's repair carries
  out".
- `cli.sandbox-gate`: an example for `runtime-missing`, and its source.

No test is removed or skipped. In `app.sandbox-start-words`, the test that
checked four codes point to "open Settings and set up the sandbox there." now
checks three, and a new test checks `runtime-missing`'s repair fix with more
`expect` calls than the code had in the loop.

## Covers

- cli.commands.plugin.off-here
- cli.sandbox-gate
