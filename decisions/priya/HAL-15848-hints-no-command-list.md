# Decision: Studio's "can't start it" lines say halonic in a terminal can, not a list of commands

- Task: HAL-15848
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15848 (a team decision with no board card, HAL-2282 rule: wording on the approved Harness page, New agents run setting and sandbox-not-ready banner; Sofia's line on HAL-15847, and rows 32, 39, 43 and 44 of words check C655 on HAL-15956)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DS8wztmKPpOBcyjhreYDUwbu9GrQNHHohTnDf3/23qYKDk+1CToESKNjkUAKmAM8cy+RwU/iJ8B4rh5EkzrGAQ==

## What changes

The lines that say Studio can't start an agent outside the sandbox listed the commands that can
("halonic run and halonic serve", or only "halonic serve"). The list was incomplete, because
`halonic runs send` starts one too, and would go stale again. They now say "halonic in a terminal
on this computer can.":

- Harness page, under On this computer: "Studio can't start it this way yet; halonic in a terminal
  on this computer can."
- `settings.new-agents-run`, the hint's second line and the dialog for On this computer: "Studio
  can't start agents outside the sandbox yet; halonic in a terminal on this computer can."
- The `not-offered` reason, in the one catalogue, the CLI's copy and Studio's harness host: "Studio
  can't start Claude Code or Codex agents outside the sandbox yet; halonic in a terminal on this
  computer can." It gains "yet", as the other two lines have it (microcopy 1.1). The fixes stay as
  they are.

Three changesets that aren't released yet say the same (C655 rows 43 and 44), and the "Blocked 3
sites" changeset now says only the icon turns amber (C655 row 32). None of these lines is in
0.1.0.

## Tests

No test is removed or weakened. The tests now check the new sentences in full. The Harness page's
test checked that the line names "halonic run" and "halonic serve"; it now checks the whole line
and that it doesn't name `halonic serve`, so it still makes two checks.

## Covers

- settings.new-agents-run
