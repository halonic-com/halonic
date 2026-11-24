# @halonicjs/studio-feature-assistant

The Assistant feature of the Studio: the Build chat, its sessions and its changes to review
(flow-assistant, T14).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-assistant` (the feature) and `@halonicjs/studio-feature-assistant/api`

## What is here

- `src/api.ts`: `AssistantHost`, which the app provides for each open workspace as
  `AssistantHostService`. It covers the chats (the newest 40, drafts, titles, rename, delete), one
  answer in a chat, the model per chat and the Model menu, and Accept, Reject and Undo of the
  changes to review, and the workspace's own authoring skill (`authoringSkill`, `customizeSkill`).
  `onDidChange` says when any of it changed.
- `src/panel`: the Assistant's side panel (flow-assistant 2.2): the chat's title, **New chat** and
  ✕, the status line, the transcript and the box with Send and Stop, and under a Build chat's box
  **customize skill** or **edit skill** (flow-assistant 5.10), not on a phone.
- `src/chat`: the Build chats of a workspace in this session (`BuildChats`): which chat the panel
  shows, each chat shown so far (so going back to one shows it at once), the answer being written
  and how each reply ended, with the words the panel says.
- `src/cards`: the proposal card (flow-assistant 3.2 to 3.4): the tag and the sentence Changes
  uses, the path, the why, **Show the diff**, **Review**, **Accept all** and **Reject all**, each
  decision as one step with a toast and **Undo**, and the notes that tell the model about it with
  the next message. `CardReviews` follows each card's changes to review, wherever they are decided.
- `src/feature.ts`: the panel window, Ctrl+Alt+I and Ctrl K's **Assistant** and **New chat**.

The desktop app provides the host for each open folder (`apps/studio/src/assistant`,
`studio.workspace-assistant`): answers on the engine's chat service with the Build chat's tools
from `@halonicjs/assistant`. Until the sessions store lands (T14 PR 2 and 3), its chats last
while the window is open. When Halonic's engine stops mid-answer, the reply ends with "Stopped
when Halonic's engine stopped." (`assistant.chat.engine-stopped`). While the engine isn't
answering, the chat says so at the top and Send waits (`assistant.chat.engine-not-answering`). A
model from a workspace that isn't trusted opens the trust check instead of sending
(`assistant.chat.trust-check`), and a message that looks like it holds a key stays in the box
(`assistant.chat.key-in-message`). The chat tab, the chat menu, a card's states after a decision
(T14 PR 8b) and the model's own lines under the box (no model, no key, local only, budget) come
later.

## Example

A screen reads the host from its feature context and follows its changes:

```ts
import { AssistantHostService } from "@halonicjs/studio-feature-assistant/api";

const assistant = context.services.get(AssistantHostService);
const chat = await assistant.newChat("build");
const stop = assistant.onDidChange((change) => {
  if (change.kind === "chat" && change.chatId === chat.id) {
    // read the chat again
  }
});
await assistant.answer({ chatId: chat.id, message: "Add a routine that runs triage at 9" });
stop();
```

The Settings › Assistant settings come from the Settings feature:
`assistantPrefs` in `@halonicjs/studio-feature-settings/api`, read through its `HostSettingsService`.
