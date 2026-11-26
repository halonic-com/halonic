# @halonicjs/studio-feature-quick-ask

Quick ask: a box that opens over any app to ask an agent. The question goes into the person's
1:1 chat with that agent in Messenger, so nothing is kept twice; the answer shows in the box while
it is open, and as the normal Messenger notification when it is closed.

- **Layer:** studio
- **Owner:** tomas
- **Public API:** `@halonicjs/studio-feature-quick-ask` (the feature) and `@halonicjs/studio-feature-quick-ask/api`
- **Requirements:** `quick-ask.session`, `quick-ask.answer`, `quick-ask.box`, `quick-ask.messenger`

This package holds the box's work, `AskSession` (which agents, which is picked, the unsent text,
sending, watching for the answer) and `AskMemory` (what the box remembers in the page's storage),
and its screen: the focused app `ask`, a `dialog` labelled "Ask an agent" with its own agent picker,
floating on the see-through window the desktop shell shows for quick ask's keys. The desktop app
gives it `AskWindowService`, which hides that window, brings Studio forward and opens a chat in
Messenger for **Open in Messenger**, **Answer in Messenger** and **Last answer ›** (the shell's
`plugin:quick-ask|open_chat`). In Studio's own window it also gives `AskOpenerService`, which shows
the box (`plugin:quick-ask|show`) for **Help › Quick ask** and its Ctrl K entry; the feedback
feature draws those, with the keys, since it already names them in Settings → Keyboard. In the
desktop app the shell lets the box's window call only three agent host routes,
`POST /v1/messaging/read`, `/send` and `/changes`; asking through another one also needs the
shell's list in `apps/studio/src-tauri/src/agent_host_window_routes.rs`. Every word
is in `quick-ask-words.ts`.

## The box's states

`quick-ask.box` holds the exact words; in short, the box shows one of these:

- **Ready:** the text box "Ask {agent} anything" has the focus, with the hints
  "Enter ask · Tab another agent · Esc close".
- **Picking an agent:** Tab or a click on the agent opens "Find an agent", Recent first, then
  each workspace and team ("No longer connected" for an agent whose source is gone). Esc closes
  only the picker.
- **Working:** after sending, the question shows at once with "{agent} is working".
- **Waiting:** "You can close this. The answer comes to your chat with {agent}." An earlier
  question's working line turns into this when a newer question goes out.
- **Answered:** the answer in a polite live region, **Copy** in place of the hints, and "Reply to
  {agent}" in the text box. When the answer holds a card: "{agent} asks you to choose" and the
  card's question.
- **Not sent:** the question edged in the danger colour, "Not sent · Try again" and
  "Couldn't reach {source}. Your question is still here."
- **No agents:** "No agents yet", "Connect a workspace or a team in Studio to ask its agents." and
  **Open Studio**.

Esc, or a click beside the box, fades it out and hides its window. It opens again empty, with the
unsent text and the picked agent kept.

## Example

```ts
const session = new AskSession(messenger, new AskMemory(window.localStorage));
const opening = await session.open();
if (opening.kind === "ready") {
  const outcome = await session.ask(opening.agent, "Where are we with the release?");
  if (outcome.kind === "sent") {
    const stop = session.watch(opening.agent, outcome.question, (state) => show(state));
    // When the box closes:
    stop();
  }
}
```
