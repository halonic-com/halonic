# Decision: the stopgap trust words end, and trust says again what it promises

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14842 (team decision on the C52 Studio claims check, HAL-12644 item 1: the full wording comes back once HAL-12409 lands)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:z8zkTsMWPBqK6NyWjR3Q7SAVlAWjBgRZ5+4lBonaJ109QjGH9MCRe2p+KA8ezOirj0FkSYbZ1sfIKyy94wylAg==

The stopgap of HAL-12646 (`decisions/elena/HAL-12646-trust-delete-words.md`) said only what trust
gated before Studio runs checked it. That has ended: since HAL-12409 (#3756) the engine checks trust
when it opens and before every start (`studio.untrusted-starts-nothing`), the model resolver refuses
every provider but the test model in a workspace that isn't trusted (`cli.workspace-provider-key-trust`),
and since HAL-13134 (#4105) Knowledge › Summarize sends nothing either (`studio.workspace-knowledge`).
A connector's tools are read only after the trust check (`workspace-listed-tools.ts`). What still
starts in an untrusted workspace is the computer's own agent harness, to read its version and
sign-in, which is not the workspace's program and calls no model.

So the words go back:

- Trust section: "Not trusted yet. Halonic won't start programs or call real models from this workspace."
- The badge's tooltip: "Halonic won't start this workspace's programs or call real models until you
  review it. You can still read and edit everything."
- Remove trust, in Settings › Trust and Settings › Trusted sources: "Halonic will ask again before
  running anything from this workspace, and runs in progress stop." The last part stays, because
  removing trust still closes the engine and ends its runs (HAL-13678). A workflow's Run, Routines'
  Run now and Run again open the trust check; a request from the Inbox and a routine's schedule
  refuse instead, and nothing starts without trust either way.

The plugin line, "Its tools won't run until you trust it again.", stays as it is. No test was weakened:
the same assertions check the new words.

## Covers

- workspace.trust-section
- workspace.trusted-sources
