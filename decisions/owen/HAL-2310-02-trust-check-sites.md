# Decision: the CLI's trust check lists the sites a program connector may reach

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3; decided by Liam on HAL-2303); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QPpqjtc8OWGEEnthxBDcuvd/v6bjqjq5o07k6zuiS+UagpSVf+tiFXPB27QC4E0nkPdX+Yy2QoB/uS+UYSSgDg==

HAL-2310 adds `sites` to a stdio connector (halonic#2067): the sites its program may reach when it runs
in a sandbox. The trust fingerprint covers them; this makes the trust check show them, so a person sees
what they trust.

- `cli.trust-check`: a program's row shows every site it names, one per line, under its command and
  `!` line, with the label and notes an agent's allowed sites already have ("Allowed sites", "every
  site under …", "(non-Latin letters)"). No new wording. The summary's site count includes them, each
  site once with the agents' sites. A changed program shows its rows again, sites included, as it
  already does for every other field. One clause and one example are added.

Nothing is removed and no test is removed or weakened.

## Covers

- cli.trust-check
