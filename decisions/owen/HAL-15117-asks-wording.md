# Decision: the asks rows say what will happen, and four wording fixes from C544

- Approval: HAL-15117, from Iris's flow check C544 (HAL-15101); plan on the task, for Liam's review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:l5GMmKnuRhfEYjyQTtqGoE49PfiqtvxivqnXUa586o3P5MQDMpWvFuM2EIdwVj6rrjYaBQlvLlDNjq+2zUjzBQ==

The trust check and Studio's trust review said an agent with
`asks: in-sandbox` "edits and runs commands in its working folder, inside the
sandbox". Nothing does that yet: #4443 added the policy, but no host reads
`in-sandbox` until the CLI wiring (HAL-14992 part 2b), and Studio's agent host
comes after that. A trust review must not state behaviour that doesn't exist,
and hiding the row would leave a field in the trust content that nobody sees.
So the rows now say it **will** edit and run commands, and that this version
still asks first. Each later pull request drops that clause where the calls
really are answered.

The other changes are wording from the same flow check:

- Studio's Agents section opens when an agent acts without asking, and the
  changed line uses the same label, `Without asking`.
- A line under a trust row puts a colon after its label (new requirement
  `workspace.trust-check-lines`).
- `halonic trust` without a terminal, after a change, says the workspace
  changed since you trusted it, not that it "isn't trusted yet". The released
  requirement only gains an example; the never-trusted wording stays.
- The Codex refusal's fix says how: start the run again without
  `--harness codex`.

Nothing is removed from any requirement's promise: the rows still show, the
refusals still refuse, and every test only changes the words it checks.

## Covers

- cli.trust-check-asks
- cli.run-harness-asks
- cli.commands.trust.review-and-trust
- studio.trust-review-asks
