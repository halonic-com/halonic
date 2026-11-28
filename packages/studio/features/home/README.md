# @halonicjs/studio-feature-home

The Home feature of the Studio: Home's page in the rail's layout (HAL-20673 rail flows, section 2).
Its list column shows "New chat", then the folder's AI chats, newest message first; its content
pane shows the open chat, or Home's sections while none is open.

- **Layer:** studio
- **Owner:** mateo
- **Public API:** `@halonicjs/studio-feature-home` (the feature) and `@halonicjs/studio-feature-home/api`

The shell adds Home's rail entry, keeps which chat is open and draws Home's sections; this
feature sets Home's two slots, the list column and the content pane, with `home.setView`
(`shell.home-view`). The chats come from the Assistant's `AiChatsService`; without the Assistant,
the column is empty and the pane shows Home's sections.

## Example

```ts
import { homeFeature } from "@halonicjs/studio-feature-home";

const shell = createShell({ features: [assistantFeature, homeFeature] });
```

## Requirements

- `home.list-column`: "New chat", the AI chats, "No chats yet.".
- `home.content-pane`: the open chat, or Home's sections.
