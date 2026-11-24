# Decision: the CLI's line for a file changed since the run points to Compare

- Task: HAL-17152
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17152 (a team decision with no board card, HAL-2282 rule: wording on the approved proposal flow; row 9 of words check C782 on HAL-17146, following HAL-16075 §3)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hFWUS5t4d9Rg02AbmvVHm2/smBo1ylAX0sFdURCH76GOM61dbTPPhtS5c2fEN4R9T33Cn3LrDl/t83ucMgB+Bw==

## What changes

- **A file changed since the run (C782 9).** On HAL-16075 §3 the team decided that once Compare
  ships, `halonic proposals accept` points to it for a file that changed since the run, as Studio's
  line ("Accept opens Compare") does. Compare shipped in #5435. The line now says "notes/today.md
  changed since the run, so it wasn't written. Compare it in Halonic Studio, or reject it with
  halonic proposals reject 01jd8q notes/today.md to keep it as it is now." (and the same for
  several files, with `<file>`). The `decide` requirement now says the file is named with a pointer
  to Compare in Halonic Studio as well as the reject command, and its example quotes the new line.
  Nothing else in the requirement changes: the file is still not written, stays undecided, and the
  command still exits 5.

## Covers

- cli.commands.proposals.decide
