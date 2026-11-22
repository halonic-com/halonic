# Decision: a run a key's list of addresses refused says so in Studio, with Open Models

- Approval: HAL-15512 (Paperclip task), from Nina's C585 check (B2, HAL-15496); wording decided by the team under HAL-2282; Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-15523 (C587 on HAL-15498) for Studio's banner; the CLI side of HAL-15512 landed with HAL-15333 (#4604)
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lW9aQA7kJ5DAvY+zU4IY9StlES9fzA5yVaZk7JMdUOrDf4ysPUIXPrW/Hk4g4RqDpAH1qv2wlaRbdjIaEFCwDA==

## What changes

`runs.run-view.failure-banners`: a run whose cause is `models.key-origin-not-allowed` (the app's failure `key-address-not-allowed`, from HAL-15333) gets its own banner on Studio's run page:

```
Support reply failed in the step Read the email: provider claude can't send key "anthropic-key" to https://api.anthropic.com. That address isn't allowed for this key.
To allow it, add https://api.anthropic.com to the addresses of key "anthropic-key" in Models, then run again. Only allow an address you recognise.
```

with **Open Models** and no **Run again**. That covers every run that can't ask "Allow this address?" (a routine's trigger, chat, a run Studio didn't start) and a run whose person answered **Don't allow**. Before, the banner said "Halonic can't tell the cause yet" with **Run again**, which failed the same way.

## Why

The refusal is a known rule with a known fix. `halonic run` names it since HAL-15333; Studio's run page still asked for a bug report.

## Decided by the team

- Line 1 is the model check's own sentence, as the CLI's line 1 is, so the run, the error and the trust check read alike.
- Studio's fix names Models, where a key's addresses are listed and added, rather than the command, as its other setup banners do, and keeps the caution "Only allow an address you recognise."
- **Run again** is left out, as for `local-only`, because a run is refused the same way until the key's addresses change. On a phone the banner ends with "Fix this on your computer: Models".

## Covers

- runs.run-view.failure-banners
