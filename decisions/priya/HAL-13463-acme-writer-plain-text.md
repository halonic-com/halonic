# Decision: the Acme Writer drafts plain text and signs as Acme support

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13463 (a team decision: filed by Liam from the first-run timing on HAL-13436, wording that builds on the approved Acme sample)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zOYRqtfRSxYlWJRsrPdi9Rnzlo3OCLccYubzBhTVQN0APmvEsK4PyuFzMOX2utMWFCgflJzJsf6gZ5edC7fiCQ==

On a real model, every draft of Support reply on Sam's email started with a Markdown `**Subject: …**` line and ended with a `[Your Name]` placeholder. The first real run a new user sees should give a reply they could send. So the `draft` step's prompt in `examples/acme` now asks for a reply ready to send, in plain text with no subject line and no Markdown, ending with "Acme support" on its own line. The rule sits in the `draft` step, not in the Writer's instructions, so the Writer's one-sentence summary in the `read` step doesn't get signed too.

The test model's scripted draft (`providers/mock.yaml`) and the mocked drafts in `support-reply.test.yaml` follow the prompt and end with "Acme support", each still on one line so the cases keep their line numbers. The three golden files that print a Support reply run follow: the `draft` step's prompt, the draft (with its sign-off on its own line), the token counts the test model counts from those texts, and the `definitionsVersion` hash of the definitions. Nothing else in them changes. No requirement or test is changed, weakened or removed.

## Covers

- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/runs/golden/support-reply-output.txt
