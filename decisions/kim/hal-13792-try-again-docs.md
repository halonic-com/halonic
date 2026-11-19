# Decision: the shell's requirements say Reload page fixes a failed load only in the desktop app

- Task: HAL-13792
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13792 (Nina's C239 check, HAL-13788, rows A6 and A7; words that catch up with what #3928 already ships, a team decision under HAL-2282; Liam reviews the pull request on HAL-13792 and signs this note)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XgaghUb91e0YjPu1uOObRgpH4O6LnQMT9xIQ6F/vtp+/M2UcyPKQ9zcLv3IxLdq6frcGF+JsgACLPvmcrZ3hBA==

## What changes

Since #3928 (HAL-13361), the served Studio and the phone show "Couldn't load this page" with only
**Try again** when a page's code can't load because the computer can't be reached
(`shell.page-unreachable`). Only the desktop app, or a page that throws while it draws, still shows
"This page stopped working" with **Reload page**.

- `shell.view-loading-state`: its last sentence now says **Reload page** imports the view again
  only in the desktop app, and points to `shell.page-unreachable` for served and phone. Its Reload
  page example now starts "Given the desktop app".
- `shell.page-unreachable`: "an item page section" is dropped from the places that show the state.
  `window/item-page-sections.tsx` still wraps a section in the plain `ViewErrorBoundary`, so it
  shows nothing, as #3928 says.

The shell README says the same. No code, test or assertion changes, so nothing is weakened.

## Why

The requirements promised a Reload page button the served Studio no longer shows, and a state in
item page sections that they don't show. A reader checking the Studio against them would look for
both and not find them.

## Covers

- shell.view-loading-state
- shell.page-unreachable
