# paperclip.agent-react-tool

- Status: active
- Since: unreleased
- Source: HAL-19139 (the board's yes on the card, 26 Nov 12:21 UTC), point 2 and its four-point no-noise rule

When an agent calls the tool `react(task, comment, emoji)`, the Agent tools plugin shall add the emoji as that agent's reaction to the comment in the same store as the board's reactions, replacing the agent's earlier reaction on that comment, and shall refuse, storing nothing, an emoji other than 👍 or 👀, a comment that isn't on the task, and a comment that a person didn't write. It shall post no comment and wake nobody.

## Examples

- Given the board's message `c-1` woke Elena's run, when Elena calls `react` with 👀 and later with 👍, then `c-1` carries only Elena's 👍.
- Given Liam's comment `c-2`, when Elena calls `react` on it, then the tool answers "react only to a person's message, never to an agent's." and stores nothing.
- Given ❤️, when an agent calls `react`, then the tool answers that the emoji must be 👍 or 👀.
