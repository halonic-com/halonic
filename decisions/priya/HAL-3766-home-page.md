# Decision: the shell adds Home, and refuses Home from a feature

- Requirement: `shell.sidebar-places` (`packages/studio/shell/requirements/sidebar-places.md`)
- Task: HAL-3766, which holds item 6 of HAL-3063, from Sofia's UX check of #866 on HAL-3034
- Approval: Liam decided the change on [HAL-3034](/HAL/issues/HAL-3034) and confirmed it as the API decision on [HAL-3063](/HAL/issues/HAL-3063); he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mx/qd400y2Kbesw21nurE/HOne8XzR3nuhgjyZ+FmgfhGLj5BfhGob2P/mMAi6Ya2B2qVjPTrBHDssQ1Q1C9Ag==

## What changes

The shell adds the Home place itself, before any feature registers, with the Home page as its
view. The places list always starts with Home, recorded as added by `shell`. A feature that calls
`places.add` with `home` gets a `ShellError` that says the shell adds Home itself and points to
`home.addCard`, the new point for Home's sections.

The requirement gains the sentence that the shell adds Home, and "adds Home" joins the cases that
throw. The "only Home is added" example becomes "no feature adds a place", which now lists Home
from the shell, and a new example covers a feature that adds Home. The first example's list now
starts with Home.

## Why

Home is the shell's own page: it collects other features' cards and is where closing the last tab
lands, so it can't depend on a feature registering it. If a feature could add Home, two features
could race for it, or Home could be missing. No feature adds a place yet, so changing this now
costs nothing.

## Tests

No test was weakened. The "only Home" test now has no feature and checks that Home comes from the
shell and that its view loads. The "lists nothing" test is replaced by it, since the list is never
empty now. A test was added for the refusal of Home from a feature, and the order test expects
Home first.

## Covers

- shell.sidebar-places
