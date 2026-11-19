# kit.chat-loading

- Status: active
- Since: 0.1.0
- Source: HAL-13177; states (HAL-5896) section 4, H7 and D3; microcopy 14.1 (Loading this chat); HAL-11705

While a chat first loads, the kit's `ChatLoading` shall show nothing for 300ms, with its status line already there and empty. When 300ms have passed, it shall show three still skeleton lines, hidden from screen readers, and its status line shall read its `label`. When 10 seconds have passed, it shall show "Still loading" and a `secondary` **Try again** button under the lines, keep the lines, and its status line shall read "Still loading". When the person clicks Try again, it shall call `onRetry`.

## Examples

- Given a ChatLoading with "Loading this chat",
  when 300ms have passed,
  then three hidden skeleton lines show and the status line reads "Loading this chat".
- Given a ChatLoading after 10 seconds,
  when the person clicks Try again,
  then `onRetry` is called and the lines stay.
