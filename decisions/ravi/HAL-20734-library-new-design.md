# Decision: Library's kinds are chips in a list column, beside a content pane

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20617 (the approved build plan, P3 and P5; part recipes on HAL-20672); Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vwtA2Ma+ojcwEL1w+ut7yHCmTmazFCqt7uuhURVdwLwiCA9/sFQnPbzab/C5E2BvTgidpDw78fMPWgnRZgDWCQ==
- Task: HAL-20734

## What changes

- `library.library-page`: the four kinds are a one-of row of chips named "Library", not four
  tabs, and the rule and its examples say "kind" where they said "tab". The kind's sentence stays under the title on a phone; on the desktop the content pane
  says it (`library.list-column`, new). Only the kinds that have one show a New button, and
  on the desktop it sits on the title's line rather than under the chips (`library.list-column`). Two examples no longer name the sentence: the content
  pane's examples hold it now.
- `library.broken-connectors`: the count of broken connector files is on the Connectors chip
  (`kit.filter-chip-count`, from HAL-20805), with the same words for screen readers ("Connectors,
  1 problem"), and the rule says "kind" where it said "tab".
- Tests: the Library page, place and broken-connector tests find the kinds by the chips' radios
  instead of `role="tab"`, and the phone tests check there are no chips instead of no tabs. The
  sentence's check moves: a page test reads it under the title on a phone and finds none on the
  desktop, and the content pane's tests read it for Skills and Knowledge.

## Why

The build plan (HAL-20617, P5) rebuilds Library on the new design's parts. Its list panel recipe
has filter chips under the search, not tabs, and the list sits in a column beside the
content at the kit's list-column size (`kit.list-column`, P3). A rule or test that names tabs would describe parts Library no longer has.

## Covers

- library.library-page
- library.broken-connectors
