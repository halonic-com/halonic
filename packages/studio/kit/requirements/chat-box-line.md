# kit.chat-box-line

- Status: active
- Since: unreleased
- Source: HAL-13177; states (HAL-5896) section 4, H17, H19, H21, H27, H29; microcopy 8.3 and 14.1; HAL-11705

The kit's `ChatBoxLine` shall show the line under a chat's box in `text-small`: for a `warning` line, the 16px triangle in `warning`, hidden from screen readers, then the sentence in `fg`; for a `muted` line, the sentence in `fg-muted` with no mark. It shall show its actions after the sentence, in the order given, and wrap them under it when there's no room. It shall never shorten the sentence.

## Examples

- Given a `warning` ChatBoxLine "This looks like an API key. Keys go in the key field, so they stay out of chats and files." with "Go to the key field ›" and "Send anyway",
  when it renders,
  then it shows the triangle, the sentence, the link and the button, in that order.
- Given a `muted` ChatBoxLine,
  when it renders,
  then it shows the sentence in `fg-muted` and no mark.
