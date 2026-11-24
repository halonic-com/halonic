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
- `src/panel`: the Assistant's side panel (flow-assistant 2.2): the chat's title, **New chat**,
  **Open as tab** and ✕, the status line, the transcript, the strip "*n* items to review" with
  **Accept all** and **Reject all** for the whole chat (flow-assistant 3.5, two or more items), the
  box with Send and Stop, and under a Build chat's box
  **customize skill** or **edit skill** (flow-assistant 5.10), not on a phone.
- `src/tab`: a chat open as a tab (flow-assistant 2.3): the chat on the left, on the start screen
  with the halo and glow while it's empty (flow-assistant 6), and a side panel for the items it
  shows, closed until it shows one. **Continue in the side panel** moves the chat back.
- `src/chat`: the Build chats of a workspace in this session (`BuildChats`): which chat the panel
  shows, which ones are open as tabs (one chat in one place), each chat shown so far (so going back to one shows it at once), the answer being written
  and how each reply ended, with the words the panel says.
- `src/cards`: the proposal card (flow-assistant 3.2 to 3.4): the tag and the sentence Changes
  uses, the path, the why, **Show the diff**, **Review**, **Accept all** and **Reject all**, each
  decision as one step with a toast and **Undo**, and the notes that tell the model about it with
  the next message. `CardReviews` follows each card's changes to review, wherever they are decided,
  and its state once none are left (flow-assistant 3.3): **Accepted**, **Accepted 2 of 3**,
  **Rejected** or **Replaced**, each a `neutral` chip. It tells an Accept from a Reject made
  elsewhere by the baseline (an Accept moves it) or, for the last changes, by the saved file. A
  file that changed outside Halonic waits for **Compare**. The state lives for the session: a card
  decided before Studio started says **Accepted** only when its file is just as the model wrote it.
- `src/feature.ts`: the panel window, the chat tab's item kind (`assistant-chat`), Ctrl+Alt+I and
  Ctrl K's **Assistant** and **New chat**.

The desktop app provides the host for each open folder (`apps/studio/src/assistant`,
`studio.workspace-assistant`): answers on the engine's chat service with the Build chat's tools
from `@halonicjs/assistant`. Until the sessions store lands (T14 PR 2 and 3), its chats last
while the window is open. When Halonic's engine stops mid-answer, the reply ends with "Stopped
when Halonic's engine stopped." (`assistant.chat.engine-stopped`). While the engine isn't
answering, the chat says so at the top, in the window's words, and Send, Continue and Try again
wait (`assistant.chat.engine-not-answering`). When the chat's model can't be used (no model at
all, a missing key, a cloud model in a local-only workspace), a line under the box says why
(`assistant.chat.model-line`). A
model from a workspace that isn't trusted opens the trust check instead of sending
(`assistant.chat.trust-check`). Before trust, a Build chat on the person's own Settings ›
Assistant model answers with the authoring tools only, on no engine
(`studio.assistant-authoring-turn`), under the line "Not trusted yet · it can read and propose, but
not run anything." with **Review** (`assistant.chat.authoring-only`). A message that looks like it
holds a key stays in the box (`assistant.chat.key-in-message`). A failed model call says the
provider's own sentence, as the run page does but ending "then try again.", with **Open Models ›**
(F7, F8, `assistant.chat.failed`); the app gives its facts on the answer (`AssistantAnswer.failure`)
and the Runs feature words them (`chatFailureLine`). The chat menu and a card's states after a
decision (T14 PR 8b) come later.

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
