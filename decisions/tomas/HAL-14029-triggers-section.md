# Decision: a page can list the sections other features add to it, and draw one alone

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14029 (Liam, CTO; reviewed in the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9P6Dm0v5Xw5330qpi/qiMtvmmZsNZHpm8rmFMv6yqfQj4U88ssrzqzDaBYYsnKSrXotrQoIih9jKaEANhLwjDg==

The routines feature adds its **Triggers** section to the agent's and the workflow's page, but no
page placed `<Sections />`, so **Add trigger** couldn't be reached in Studio. flow-routines 2.3
and g5-frames put Triggers in Configuration's page list, after Tools, not as a block under it.
A page couldn't do that, because it couldn't see which sections it has or what they're called.

**`shell.item-page-sections`.** The requirement keeps everything it said, and adds that the shell
tells the page each section's id and title, in order, and that `<Sections only={id} />` draws that
one section alone. `itemPage.addSection` now takes a `title` for that list. Plain `<Sections />`
draws all of them as before, so the workspace and connector pages don't change. A new example
covers the list and a single section.

The agent page lists Triggers as a Configuration page after Tools (new requirement
`agents.configuration.section-pages`). The workflow page follows in a later pull request.

No test was removed or loosened.

## Covers

- shell.item-page-sections
