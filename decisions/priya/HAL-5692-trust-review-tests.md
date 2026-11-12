# Decision: the refused example in `halonic trust` names the folder as typed

- Approval: Liam approves this note when he signs it, after his review of this pull request on
  HAL-5692, a follow-up of Julian's security review on
  HAL-5436
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6kWXvOhs23rGNJkvQHzkvIHdbeLsbh0Ni23ck4SD7+P3Z6zsyK2f8/6BQ1KTyX6R9HVGhe7XOxqTtZBPJ+t9Cg==

## What changes

The refused example in `cli.commands.trust.review-and-trust` says "Couldn't trust **acme**", the
folder as the user typed it, which is what the CLI prints. It said **Acme**, which the CLI never
prints.

## Why

The example has to match the output. Julian's review found the mismatch.

## What doesn't change

The CLI's output and the wording around the name stay as they are: only the example is corrected.
No test is skipped or weakened: the leak tests now check the user, password and host of a refused
address instead of only the password, and new tests cover `grant` on refused content.

## Covers

- cli.commands.trust.review-and-trust
