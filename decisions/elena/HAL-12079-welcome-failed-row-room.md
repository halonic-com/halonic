# Decision: the Recent row that failed keeps 16 px of room when it scrolls into view

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12036 (Sofia's design check W1 on the approved Welcome screen, HAL-12044: same screen, same wording, no new flow)
- Kind: user-visible

At 360x640 the failed row scrolled in flush with the bottom of the window, so the lower edge of its danger
outline touched the window edge. Every Recent row now has a 16 px scroll margin (`scroll-my-4`), so
`scrollIntoView({ block: "nearest" })` leaves the outline clear. Nothing else moves. A test checks the class.

## Covers

- shell.welcome-recent
