# @halonicjs/studio-feature-quick-ask

Quick ask: a box that opens over any app to ask an agent. The question goes into the person's
1:1 chat with that agent in Messenger, so nothing is kept twice; the answer shows in the box while
it is open, and as the normal Messenger notification when it is closed.

- **Layer:** studio
- **Owner:** tomas
- **Public API:** `@halonicjs/studio-feature-quick-ask` (the feature) and `@halonicjs/studio-feature-quick-ask/api`
- **Requirements:** `quick-ask.session`, `quick-ask.answer`

This package holds the box's work without its screen: `AskSession` (which agents, which is picked,
the unsent text, sending, watching for the answer) and `AskMemory` (what the box remembers in the
page's storage). The box's screen, its window and its key come in later changes.

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
