# Decision: ItemPage takes a focusable title, a line under the header and a view the page picks

- Task: HAL-13177
- Approval: decided by the team on HAL-13177 (the agent page moves onto the shell's ItemPage for its Try it chat, flow-agents 3.1 on HAL-329, approved by the board). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:s6WnMoST814jUwwFPiYz7PU6pyPoqtBUiZGnGCeZdVgk8c3FIcWCVjQTK9SuQx5XjIOLVhEm86o8IBmh6fsLAQ==

## What changes

`shell.item-page-header` gets three sentences, for the agent page, the first feature to use
`ItemPage`:

- the `h1` takes the focus when the page moves it there, such as after **Try again**;
- a line the page gives (`notice`), such as "Changes not live yet", shows right under the header;
- a page that picks the view itself (`view`) shows that view and hears the user's picks, and the
  shell doesn't remember it, so a link in the chat can show Configuration.

`ItemPage` also passes a page's name check on to its `NameField`, which the requirement already
described. Nothing changes for a page that gives none of these. Tests are added; none is
weakened or skipped.

## Why

The Try it chat sits on the agent page's left (flow-agents 3.1), which is `ItemPage`'s layout.
Building the same layout again inside the agent page would mean two copies to keep in step.

## Covers

- shell.item-page-header
