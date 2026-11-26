# @halonicjs/studio-feature-feedback

Screenshot feedback: press the shortcut (Ctrl+Alt+F, ⌘ ⌥ F on macOS), select an area of the
screen, write a line, and Studio sends it to Paperclip as a task.

- **Layer:** studio
- **Owner:** tomas
- **Public API:** `@halonicjs/studio-feature-feedback` (the feature) and `@halonicjs/studio-feature-feedback/api`

This package holds the feedback windows' pages and the parts with no screen or native code:

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

- `feedback-windows.tsx`: the pages Studio mounts in the shell's feedback windows, with no
  workspace. `overlay/` is one screen's selection overlay: its still from
  `plugin:feedback|still`, dimmed, the hint, the box and its size; letting go of a box calls
  `plugin:feedback|select` and Esc `plugin:feedback|end` (`feedback.overlay`). `unavailable/` is
  the window a press opens where no still can be taken yet, macOS and Wayland
  (`feedback.unavailable`).

- `settings/`: Settings → Keyboard, the **Send feedback** row whose **Change** records a new
  shortcut and hands it to the shell's `plugin:feedback|shortcut_set` (`feedback.settings-shortcut`),
  under it the **Quick ask** row, for quick ask's keys through `AskKeysSettingsService` from
  quick ask's `api.ts`, with the taken and Wayland lines (`feedback.settings-quick-ask`),
  and Settings → Feedback, the **Project** and **Assign to** the Send feedback window reads
  (`feedbackPrefs`, host settings) and how many feedbacks wait (`feedback.settings-section`). Both
  show only in Studio's own main window, where the app gives `FeedbackSettingsService`.

The shortcut and the screen capture are the shell's (`apps/studio/src-tauri/src/feedback_*.rs`).
The Send feedback window comes in a later pull request.

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
