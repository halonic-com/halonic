# Decision: the CLI's trust check shows a program's sites only where a sandbox works

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3); Liam's point 4 on HAL-2310 and his decision on HAL-8403; Liam approves this note in review
- Kind: internal
- Signature: unsigned

The trust check listed a program connector's `sites` as "Allowed sites" and counted them in the summary everywhere. Where no sandbox works, the program starts as before and `sites` limits nothing, so that wording would suggest a fence that isn't there.

- `cli.trust-check`: the check shows a program's sites, and counts them, only when the host says the sandbox works. A host that says nothing counts as no. An agent's sites are unchanged.
- `halonic trust` and the check a run shows ask the sandbox the same question a connector's start asks (`Sandbox.check`), so the prompt and the start agree.
- `docs/security/trust.md` says so in the Programs section.

Not in this part: Studio's trust prompt (it comes with the agent host's connector routes) and the agent host itself.

## Covers

- cli.trust-check
