# paperclip-client.bot-notes

- Status: active
- Since: unreleased
- Source: front bot plan (HAL-18847, section 2.2: Messenger keys on the bot's `chat-notes` route); task HAL-19646, from HAL-19588 point 5; the read for progress notes, task HAL-19714

When a comment on a chat task has no author and the agent-tools plugin's `chat-notes` route lists its ID for that task, the Paperclip provider shall give it as a message from the chat's agent marked `automatic`, because the front bot posted it. A comment with no author that the route doesn't list shall stay a person's ("Board"), whatever its text. The provider shall read the route only when the chat has a comment with no author, or when the person wrote in the chat in the last day (`paperclip-client.progress-notes`). When the plugin isn't installed (404) nothing is marked; when the read fails, the chat shows unmarked and the failure is reported.

## Examples

- Given a comment with no author whose ID the `chat-notes` route lists,
  when the provider lists the chat's messages,
  then it is from the chat's agent and marked `automatic`.
- Given a comment with no author starting with `*Assistant:*` that the route doesn't list,
  when the provider lists the chat's messages,
  then it is from "Board" and not marked.
