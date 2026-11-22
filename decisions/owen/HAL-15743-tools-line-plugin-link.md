# Decision: the plugin name in "Couldn't list the tools from …" opens the plugin's page too

- Approval: Liam approves this note in his review of this pull request on HAL-15743 (a team decision with no board card, HAL-2282 rule: the same detail of the run page's step panel as HAL-15453, which Liam asked to extend to this line)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/RYLk0DKm8fbX3QHmsGsoMI6nC5y3j0tf5M4Hs6jMRpH/btROCWuF6Dvl6n8z1KJN9g+gmORYwwucazVYTKNAw==

## What changes

#4695 (HAL-15453) made the plugin's name in the line under a failed tool call ("✕ Didn't work:
the connector *handbook* didn't start: its plugin *files* isn't trusted yet.") an inline link
to the plugin's own page, `plugin/this-computer/<id>`, which has the trust step. The line above
a step's tool calls, "✕ Couldn't list the tools from *handbook*: its plugin *files* isn't trusted
yet." (added by #4439), still showed the name plain, because its own requirement didn't say it
was a link.

Now that line follows the same rules: where the window can open pages, the plugin's name (for
"isn't trusted yet" and "changed since you trusted it") is an inline link, still in italics, to
the plugin's page; elsewhere it stays plain italics. A program or a secret stays in code style
and is never a link. The words don't change.

## Why

The two lines say the same thing about the same plugin, so they should lead to the fix the same
way. A person who sees only the line above the tool calls (the connector couldn't list its tools,
so the step made no call through it) otherwise gets no way to the trust step.

The test "names the plugin … in italics" now says "without a link where pages can't open" and
checks that there is no button; it checks the same things as before, plus that one. New tests
check the link and what it opens, and that a program or a secret has no link.

## Covers

- runs.run-view.step-connector-not-started
- packages/studio/features/runs/src/run-view/step-connector-not-started.test.tsx
