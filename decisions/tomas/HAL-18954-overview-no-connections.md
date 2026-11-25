# Decision: Overview with nothing connected says No connections and offers Connect Paperclip

- Approval: HAL-18954 (Sofia's team wording decision on an approved screen, under HAL-2282, from
  the post-merge words check of #6235); Liam approves and signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TwzT8qkezJ+UTIubWQlCbhYXronfQa+KwKOvElu9ExaEopZ2Pk80nytJb3xGccfB5F2DKTZYz/hRbeD2ZtSvAg==

## What changes

The active requirement `overview.place` is edited, and one of its tests is replaced. Nothing is
retired.

- **The state with no source connected.** Overview used to say only "No agents yet.", which reads
  as "your Paperclip has no agents" and gives no way forward. It now shows, under its "Overview"
  `h1`, "No connections", "Connect Paperclip to see who works on what and which work is blocked."
  and a **Connect Paperclip** button that opens Settings › Connections when the window can open
  Settings, as the Messenger does (`messenger.not-connected`). "No agents yet." stays for a
  connected source with no agents, which `OverviewView` already shows.
- **The test.** "says there are no agents yet when no source is connected" checked the old text.
  It is replaced by a test that finds the heading "Overview", "No connections", the line, a button
  named "Connect Paperclip" that opens Settings on Connections, and no "No agents yet."; a second
  test covers a window that can't open Settings (no button).
- **Shared, not copied.** The Messenger's No connections moves to the shell as `NoConnections`
  (new requirement `shell.no-connections`). The Messenger and Overview both use it; the
  Messenger's words and behaviour don't change, and its words file keeps the two shared strings
  for the click test, which reads it in Node.

## Why

Messenger and Overview come from the same HAL-17897 phase 1 list, whose ask was a clear "not
connected" state, not a blank screen. The two places now say the same thing in the same way.

## Covers

- overview.place
- packages/studio/features/overview/src/ui/overview-place.test.tsx
