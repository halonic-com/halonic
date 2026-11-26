# paperclip-client.progress-notes

- Status: active
- Since: unreleased
- Source: front bot plan (HAL-18847, section 2.2: progress notes are never comments, Messenger reads them from the `chat-notes` route), Julian's condition on HAL-19236 (point 3: notes are plain text); task HAL-19714

When the agent-tools plugin's `chat-notes` route gives a chat task `progressNotes`, the Paperclip provider shall add each of its notes to the chat's messages, in time order, as a message from the chat's agent marked `automatic` and `plainText`, whose body is the note's text exactly as the route gave it. A note with no time, a time that isn't one or no text shall be left out. With `progressNotes` empty or `null`, the provider shall add no message. The provider shall read the route for progress notes only when the person wrote in the chat in the last day, because the plugin drops progress notes a day after the newest one.

## Examples

- Given the route gives the note `**x** <b>y</b> [z](javascript:1)`,
  when the provider lists the chat's messages,
  then they hold a message from the chat's agent, marked `automatic` and `plainText`, whose body is exactly `**x** <b>y</b> [z](javascript:1)`.
- Given the route gives `progressNotes: null`,
  when the provider lists the chat's messages,
  then it adds no message.
