# Decision: an alias's provider key for a harness agent wherever it runs

- Approval: Paperclip task HAL-13517 (Liam's call after #4052 landed, following decision (a) on HAL-12505); Liam signs this note in review
- Kind: internal

#4052 (HAL-12784) gave a sandboxed harness agent the key of its harness's provider and kept the
program's own sign-in on this computer. It didn't know about model aliases: since #3962, the engine
asks the program for an alias's model on every call (`modelForEveryCall`), so an alias agent on
this computer asked its own sign-in for a model like `glm-5.3` and failed. #3964's separate
`cli.harness-bridge-keys` never landed; this note replaces it with a change to the two requirements
#4052 added.

- `harness-host.provider-access` gets rule 0: an agent whose `model` is an alias gets the key of the
  alias's provider wherever it runs, when that provider is of a type the harness calls and has a
  `secret`. `providerAccessOf` takes it as a new optional input, `aliasProvider`, so it stays pure
  and Studio gets the same rule. Without an alias, rules 1 to 5 are unchanged.
- `cli.harness-provider-key`: an alias agent on this computer gets the key too; before the alias's
  key is named, the built-in loop's check (`cli.harness-model-access`: trust, the key's allowed
  addresses, the harness's route) runs, so a refused alias reads no key; at the type's own host the
  bridge gets the alias's model as its only model (`harness-bridge.keyed-model`), so the key pays only
  for the model the alias prices; and the host gives the engine the alias's model id from the same
  version of the files the bridge reads. Without an alias, the own host still gets no list, for the
  program's background calls.
- No test is removed or weakened. New tests: `provider-access.test.ts` (rule 0) and
  `harness-provider-key-alias.test.ts`.

## Covers

- harness-host.provider-access
- cli.harness-provider-key
