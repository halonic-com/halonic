# @halonicjs/studio-feature-feedback

Screenshot feedback: press the shortcut (Ctrl+Alt+F, ⌘ ⌥ F on macOS), select an area of the
screen, write a line, and Studio sends it to Paperclip as a task.

- **Layer:** studio
- **Owner:** tomas
- **Public API:** `@halonicjs/studio-feature-feedback` (the feature) and `@halonicjs/studio-feature-feedback/api`

This package holds the parts with no screen or native code:

- `crop.ts`: the selection box on one screen, the 8 × 8 minimum, the crop in device pixels and
  the size label (`feedback.crop`).
- `payload.ts`: the task made from the text and the moment: title, description, screenshot
  file (`feedback.payload`).
- `outbox.ts`: feedback kept while Studio is offline or not connected, sent later
  (`feedback.outbox`). Every try of one feedback goes with the same ID, which Paperclip keeps as
  the task's idempotency key, so a lost reply never makes a second task; each screenshot waits in
  its own file, never in the waiting list (`feedback.outbox-retry`). A new feedback doesn't wait
  for older waiting ones, so the words never promise an order.

The sender is `PaperclipFeedback` from `@halonicjs/adapter-paperclip-client`; Studio's services
hand it in, with the key behind its guard.

The overlay, the Send feedback window, the shortcut and the screen capture come in later pull
requests; the native part is a security change with its own review.

## Example

```ts
import { buildFeedbackTask, FeedbackOutbox } from "@halonicjs/studio-feature-feedback";

const build = buildFeedbackTask({
  text: "Run list jumps",
  app: "Halonic Studio",
  window: "Runs",
  capturedAt: new Date(),
  utcOffsetMinutes: -new Date().getTimezoneOffset(),
  studioVersion: "0.2.0",
  screenshot: { width: 1280, height: 660 },
  project: "Halonic apps",
  assignee: "Chief",
});
if (build.kind === "task") {
  const outcome = await outbox.submit(build.task, png);
  // "sent" → Feedback sent toast; "saved" → Feedback saved toast
}
```
