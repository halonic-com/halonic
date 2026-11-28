# studio-click-test.conversation-look

- Status: active
- Since: unreleased
- Source: Julian's review of #6860 and Nora's of #6875 (HAL-20763): `kit.content-header`, `kit.prompt-look`, `kit.chat-message` and `kit.chat-message-corner` are things a user sees, so click steps check them in the running app

When the Messenger step has sent its message, the click test shall read the open chat's header and the box around its message box; when Writer's Try it chat comes back, it shall read the bubble that holds step 1's message. It shall fail the step as `CONVERSATION_LOOK`, naming each value that differs, when the header isn't 64px high with a 0px bottom border, when the message box's box doesn't have 26px corners and a 52px least height, or when the bubble doesn't have 7.5px corners. It shall fail as `CONVERSATION_LOOK` too when the message box is on screen but not inside the kit's `rounded-composer` box, as `BUBBLE_LOOK` when the bubble's background is fully see-through, and as `NO_CONVERSATION_PART` when the header, the message box or the bubble isn't on screen.

## Examples

- Given a header 64px high with no bottom border, a box with 26px corners and a 52px least height, and a bubble with 7.5px corners filled `rgb(219, 231, 254)`,
  then the steps pass.
- Given a header with a 1px bottom border,
  then the Messenger step fails as `CONVERSATION_LOOK`, naming `border-bottom-width 1px, not 0px`.
- Given a message box whose box lost its `rounded-composer` class,
  then the Messenger step fails as `CONVERSATION_LOOK`, saying the box isn't the kit's.
- Given a bubble filled `rgba(0, 0, 0, 0)`,
  then the Try it step fails as `BUBBLE_LOOK`.
- Given no chat header on screen,
  then the Messenger step fails as `NO_CONVERSATION_PART`.
