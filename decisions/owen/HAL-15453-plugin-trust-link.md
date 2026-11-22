# Decision: the step panel's plugin name opens the plugin's page

- Approval: Liam approves this note in his review of this pull request on HAL-15453 (a team decision with no board card, HAL-2282 rule: it is a detail of the run page's step panel the board already approved; the owner decides it with the designer, Sofia)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pF3B7fjxiU9+FyHqiKIvzVMFJ/vLmg9Pya4jL5J/wgpvGMCYT0oi4PniILITqVeYZEbKlMMn6c2isr0y8MGLAw==
- Task: HAL-15453

## What changes

Flow check C579 (HAL-15448, finding 3) found that the step panel's line "✕ Didn't work: the
connector *handbook* didn't start: its plugin *files* isn't trusted yet." gives no way to the
fix. The CLI's next line names `halonic trust --plugin files`; Studio's line names nothing, and
the person has to know that Settings › Plugins › *files* has the trust step.

Now, where the window can open pages, the plugin's name *files* in that line is an inline link
(the kit's `inlineLinkClasses`, still in italics) that opens the plugin's own page,
`plugin/this-computer/files`. The same goes for "changed since you trusted it". The words don't
change, so Studio and `halonic run` still say the same (E4). Where the window can't open pages,
the name stays plain italics, as before. A program or a secret stays in code style and isn't a
link: neither has a page.

## Why

Of the two fixes C579 suggests, the link keeps the line quiet and its words the same as the
CLI's, and it goes straight to the page that has the trust step, instead of adding a sentence
that tells the person where to look. R11 stays a quiet line: an inline link, not a button.

The test "shows the plugin in italics, as the connector, and offers no button" now says "where
tabs can't open", because it renders the panel without a way to open pages; it checks the same
things as before. New tests check the link and what it opens.

## Covers

- runs.run-view.step-failed-call
- packages/studio/features/runs/src/run-view/step-failed-call.test.tsx
- packages/studio/features/runs/src/run-view/open-plugin.test.ts
