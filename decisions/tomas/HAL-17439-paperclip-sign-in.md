# Decision: Paperclip sign-in gets its own request list, the one exception to "no key-making route"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17714 (the board chose option B on 24 Nov, 18:20 UTC; this pull request is HAL-17439)
- Kind: user-visible

Starting a Paperclip sign-in (`POST /api/cli-auth/challenges`) makes a board key.
The board ruled on HAL-10 (24 Nov) that the Paperclip client's fixed request
list never lets a key-making route through, and Liam's decision on HAL-17437
sends sign-in to the board as an exception. Without it, Studio can't connect
to Paperclip at all.

**The board's decision (option B).** The messaging list stays exactly as the
board approved it. A second list in its own file,
`packages/adapters/paperclip-client/src/sign-in-requests.ts`, allows only the 3
sign-in requests: start, poll and cancel a challenge. None of them carries a
key. A test pins it to those 3, the file goes on Liam's reviewer paths, and
Julian reviews it as a security PR. Making extra keys (`/api/board-api-keys`)
stays forbidden.

**What changes.** `ports.paperclip-key` names this one exception and gains an
example for it. Nothing is weakened: the messaging list, its key-route test and
every other rule of the requirement stay as they were.

## Covers

- ports.paperclip-key
