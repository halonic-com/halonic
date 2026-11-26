# Decision: a plain List follows kit.list-plain, and the Inbox's open item loses its accent bar

- Approval: https://paperclip.ing/HAL/issues/HAL-19492
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:ACLNMPbmcSY99LO1pIPP4BMPIiK5q1U+c8zNDnyJIpUqCU2Y43uoIisvlKtc8K2x2c4tgp77ITGktb1aSy6uCw==

`kit.list` said every List draws its rows in one box with lines between them, with a medium-weight
title and the `surface-subtle` hover, and that the current row, "such as the Inbox's open item",
gets the `accent-soft` fill and a 2px accent bar. The Inbox and Messenger layout the board approved
on HAL-19192 gives the Inbox the Messenger's plain rows: no box or lines, a regular title, and the
muted fill on hover and on the open item, with no accent bar. So `kit.list` now says a `plain`
List follows `kit.list-plain` instead, and that look wins over `flush` and the phone's. Its
example of a current row is now the Runs app's open run, which keeps the selected look. Every List
that isn't `plain` draws exactly as before. The plan was approved by Liam on HAL-19492; Julian
reviewed it on the pull request.

## Covers

- kit.list
