# Decision: the Inbox's sidebar rows stay 80px when their text is long

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20018
- Kind: user-visible

Source: the board's correction on HAL-10 (26 Nov): the Inbox's and the Messenger's sidebar rows are
exactly 80px, padding included; Noah's design decision on HAL-20018 (option B, with the wait kept
whole). A team decision (Noah with Elena), a detail of a screen the board just corrected, built on
HAL-19735.

## Covers

- inbox.proposal-page
- inbox.row-meta-wraps
- kit.list-wrap-title
- kit.list-wrap-meta

## What changes

- `inbox.proposal-page`: in the Inbox's own list a row's title still wraps, but onto at most two
  lines, then it is cut with an ellipsis. Home's Needs you keeps wrapping it fully. A new example
  checks "Approve the refund for the Acme order from last week".
- `inbox.row-meta-wraps`: Home's Needs you keeps the two-line meta line. In the Inbox's own list it
  is one line, and its wait (" · Waiting 1 h") stays whole at its end while only the part before
  it is cut. The rule's reason, that the wait stays visible, is unchanged.
- `kit.list-wrap-title` and `kit.list-wrap-meta`: one sentence each, saying a `plain` List clamps
  the title to two lines and keeps the meta line on one (`kit.plain-row-fit`, new).
- Test `inbox.row-meta-wraps` › "lets a row's meta line take two lines…" becomes "keeps the Inbox
  row's line on one line, with Waiting 1 h whole at its end": it now checks the new behaviour. The
  check that every row asks for `wrapMeta` stays, and the kit's non-plain test still checks the
  two-line clamp Home uses.
- Test `inbox.plan-limit-card` › "doesn't call it a person step in the row" reads the row's whole
  line (`wholeLine`) instead of `meta`, since the wait is now the line's `metaEnd`. It checks the
  same text.

## Why

At 360px a two-line title on 24px lines plus a two-line meta line made a row up to 128px, which
breaks the board's 80px rows. 80px leaves 60px for text: two 20px title lines and one 20px meta
line. The title is what you scan by, and Inbox titles often start the same way, so it keeps two
lines. The meta line gives way, but keeps its wait, which is what C543 I3 was for. The full title
and line stay in the row's accessible name and in the open item's header.

No test was weakened: each changed assertion checks the new behaviour, or the same text as before.
