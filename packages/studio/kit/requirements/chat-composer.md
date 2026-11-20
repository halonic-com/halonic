# kit.chat-composer

- Status: active
- Since: unreleased
- Source: HAL-13177; UX checklist 9.5 (Enter, Stop); flow-agents 4.4; states (HAL-5896) section 4, H10 and H12; a11y 6.2 and A6; HAL-11705

The kit's `ChatComposer` shall show a message box named by its `label`, with its `placeholder`, and a **Send** button. When the person presses Enter without Shift, it shall call `onSend` once if the message isn't blank, no reply is being written and Send isn't waiting; otherwise it shall do nothing and keep the text. When the person presses Shift Enter, it shall add a line. While an input method is composing, Enter shall neither send nor add a line. While `answering`, the button shall read **Stop** and call `onStop`, and it shall be the same button as Send, so focus stays on it when it changes in either direction. While `sendUnavailable` is set, Send shall stay focusable, ignore clicks and name its reason. It shall show its `line` under the box, in a status region that is always there, so the line is read once when it appears.

## Examples

- Given a ChatComposer holding "Sort this mail",
  when the person presses Enter,
  then `onSend` is called once.
- Given a ChatComposer while `answering`, with focus on Stop,
  when the reply ends,
  then the button reads Send and still has focus.
- Given a ChatComposer with `sendUnavailable` pointing at the engine line,
  when the person presses Enter or clicks Send,
  then `onSend` isn't called and the text stays.
