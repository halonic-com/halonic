# @halonicjs/assistant

The Build chat's tools and the rules of its chats: what the Assistant may read, check and change in a workspace. It runs
anywhere `ChatService` runs: the desktop app, a served window and later the CLI.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/assistant`

## What is here

- **`buildChatTools(options)`**: the authoring tools of one Build chat, as `ChatTool`s for
  `ChatService.answer`: `list_files`, `read_file`, `schema`, `validate`, `propose_file` and
  `propose_delete` (`assistant.build.authoring-tools`). Build them once per chat and keep them.
- **Reads see the workspace as saved**, changes to review included, and keep to the limits of
  `propose_file`: nothing outside the workspace, in `.git/` or `.halonic/`, private or through a
  link, and only Halonic items while the workspace is untrusted (`assistant.build.read-limits`).
- **Writes go through `ReviewService`** at once, as changes to review on the card of their tool
  call (`assistant.build.proposals-change-nothing`). The tools remember the digest of each file
  as the model last read or wrote it in the chat, and a write checks the file still holds it
  (HAL-3247). The service refuses the paths the assistant may not write; the tools word the
  answer the model reads.
- **`validate`** checks the workspace as saved, changes to review included, as
  "<severity> <path>: <message>" lines or "No problems." (`assistant.build.validate-with-proposals`).
- **`toolTexts`**: what the tools tell the model as tool results (flow-assistant 3.1 and 3.7, AI
  changes 1.11), for the chat's tool line to show in its details.
- **The session rules** (`sessions/session-rules.ts`), pure functions over the `ChatSessions`
  port's `SavedChat`: a draft (no message yet) is never saved, `titleFromFirstMessage` cuts at 57
  characters plus "…", `chatsToDrop` keeps each workspace's newest 40, `recentFirst` orders them,
  `chatToSave` cuts tool results over 4,000 characters, and `restoredChat` brings a chat that was
  answering back stopped, for "Stopped when Halonic closed." (`assistant.sessions.*`, H14). The
  memory store is `MemoryChatSessions` in `@halonicjs/adapter-memory`.

## Example

```ts
import { buildChatTools } from "@halonicjs/assistant";

const tools = buildChatTools({ chatId: "c1", files: store, review, isTrusted, digest });
const answer = await chatService.answer({ settings, messages, tools });
```
