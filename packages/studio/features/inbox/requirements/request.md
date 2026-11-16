# inbox.request

- Status: active
- Since: 0.1.0
- Source: HAL-1305; flow-inbox 3.4; flow-first-run 4.1 and 4.2 (revision 12); microcopy 10.3

While the workspace has a workflow with a `start:` block and no card is open, the Inbox shall show the request form in the right pane, and **New request** in the list header shall bring it back. With one such workflow the form shall show its `start.label` as plain text, with several a **Request type** picker. **Message** shall use the workflow's description as its placeholder, or "What do you need?" without one. **Send** shall start the workflow with the trimmed message, say "Working…" and keep focus while it starts, and show the toast "*label* started" once it has. An empty message shall show "Write a message first." under Message and focus it, and **Send** shall never be disabled. A request that doesn't start shall show "Not started: *reason*." in a line under the form that is always in the page, and keep the message. The message shall stay while a card is open, and until it is sent. Enter shall add a line, Ctrl Enter shall send, and Esc shall go back to the list and keep the text. With no such workflow there shall be no form and no **New request**. A phone shows no form until its request sheet lands (HAL-10618).

## Examples

- Given the workflow "Answer a customer's email" with the description `A customer's email, for example: "Hi, my order #1042 arrived damaged."`,
  when the Inbox opens with nothing selected,
  then the right pane shows "Answer a customer's email", **Message** with that description as its placeholder, and **Send**.
- Given two such workflows,
  when the Inbox opens,
  then the form has a **Request type** picker with both labels.
- Given the text "  Hi, my order arrived damaged.  ",
  when you press Ctrl Enter,
  then the workflow starts with "Hi, my order arrived damaged." and the toast reads "Answer a customer's email started".
- Given an empty message,
  when you press **Send**,
  then no run starts, "Write a message first." shows under Message and Message has focus.
- Given the engine refuses with "fin@acme.example is signed out.",
  when you press **Send**,
  then the line under the form reads "Not started: fin@acme.example is signed out." and the message is still there.
- Given a typed message and a card you open and close again,
  when the form comes back,
  then the message is still there.
