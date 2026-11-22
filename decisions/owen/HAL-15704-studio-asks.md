# Decision: Studio's trust review drops "this version of Halonic still asks first"

- Approval: HAL-15704, follow-up to HAL-15287 (#4585) and HAL-15661 (#4650); team wording on an approved screen (HAL-2282), for Liam's review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FHHP707AWosOeIOlOd1AFD/2TyUxVhP4c+2gdChpS8kDZUIhlGq7pP64vWsu6L7lxqz6ESnZCYoiZX2vMF1ACQ==

Studio's trust review says an agent with `asks: in-sandbox` will edit and run
commands in its working folder, inside the sandbox, and that "this version of
Halonic still asks first". The clause was kept on HAL-15401 only because
Studio's agent host didn't answer those calls yet.

Since #4585 (HAL-15287) it does: a fenced Studio run answers the agent's
working-folder calls without a person and logs `harness.allowed`
(`agent-host.sandboxed-asks`). So the row drops the clause and reads as the
CLI's row has since #4650: "will edit and run commands in its working folder,
inside the sandbox". The Changed row uses the same words.

The row still shows for the same agents, the Agents section still starts open
for them, and the test only changes the two lines it quotes.
`docs/security/trust.md` and the format README now say both the CLI and
Studio answer the calls.

## Covers

- studio.trust-review-asks
