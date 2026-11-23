# @halonicjs/studio-feature-assistant

The Assistant feature of the Studio: the Build chat, its sessions and its changes to review
(flow-assistant, T14).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-assistant` (the feature) and `@halonicjs/studio-feature-assistant/api`

## What is here

So far only the interface, `src/api.ts`: `AssistantHost`, which the app provides for each open
workspace as `AssistantHostService`. It covers the chats (the newest 40, drafts, titles, rename,
delete), one answer in a chat, the model per chat and the Model menu, and Accept, Reject and Undo
of the changes to review. `onDidChange` says when any of it changed. The panel and the chat tab
come in later pull requests.

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
