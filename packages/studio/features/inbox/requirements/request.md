# inbox.request

- Status: active
- Since: unreleased
- Source: HAL-1305; flow-inbox 3.4; flow-first-run 4.1 and 4.2 (revision 12); microcopy 10.3

While the workspace has a workflow with a `start:` block and no card is open, the Inbox shall show the request form in the right pane, and **New request** in the list header shall bring it back. With one such workflow the form shall show its `start.label` as plain text, with several a **Request type** picker. **Message** shall use the workflow's description as its placeholder, or "What do you need?" without one. **Send** shall start the workflow with the trimmed message, say "Working…" and keep focus while it starts, and show the toast "*name* started", with *name* the workflow's name, with **Open run** (where the window can open a run) once it has. An empty message shall show "Write a message first." under Message and focus it, and **Send** shall never be disabled. A request that doesn't start shall show "Not started: *reason*." in a line under the form that is always in the page, and keep the message. The message shall stay while a card is open, and until it is sent. Enter shall add a line, Ctrl Enter shall send, and Esc shall go back to the list and keep the text. With no such workflow there shall be no form and no **New request**. When the workflows can't be read, the Inbox shall say "Couldn't load the workflows you can start." with **Try again** where the form would be (on a phone, where the **New request** row would be), which reads them again (states audit gap 5, HAL-11643). When another page asks for the form (`Inbox.requestNewRequest`, as the Try the sample card's first step does), the Inbox shall close any open card, show the form and put focus in **Message**, also when the Inbox opens only after the ask. On a phone the list shall start with a full-width **New request** row that opens the form as a sheet titled "New request", with the workflow's `start.label` as a read-only line (or the **Request type** picker with several workflows), with **Message** focused, **Send** full width at the bottom, Close named "Close, keeps your message", and the same empty-message and "Not started" lines; once the run has started, **Send** shall go on saying "Working…" over the sent message until the request's card arrives, when the sheet shall close and the card shall open by itself, and Close shall still work meanwhile, leaving only the card's row to appear and the next request empty. Before Send, Close shall keep the text.

## Examples

- Given the workflow "Answer a customer's email" with the description `A customer's email, for example: "Hi, my order #1042 arrived damaged."`,
  when the Inbox opens with nothing selected,
  then the right pane shows "Answer a customer's email", **Message** with that description as its placeholder, and **Send**.
- Given two such workflows,
  when the Inbox opens,
  then the form has a **Request type** picker with both labels.
- Given the text "  Hi, my order arrived damaged.  ",
  when you press Ctrl Enter,
  then the workflow starts with "Hi, my order arrived damaged." and the toast reads "Support reply started" with **Open run**, which opens that run.
- Given an empty message,
  when you press **Send**,
  then no run starts, "Write a message first." shows under Message and Message has focus.
- Given the engine refuses with "fin@acme.example is signed out.",
  when you press **Send**,
  then the line under the form reads "Not started: fin@acme.example is signed out." and the message is still there.
- Given a typed message and a card you open and close again,
  when the form comes back,
  then the message is still there.
- Given a card is open and the Try the sample card asks for the request form,
  when the Inbox shows it,
  then the card is closed, the form is in the pane and focus is in Message.
- Given the workflows can't be read,
  when the Inbox opens with nothing selected,
  then the right pane says "Couldn't load the workflows you can start." with **Try again**, and once they can be read, **Try again** shows the form.
- Given a phone and a sent request whose card hasn't arrived,
  when you look at the sheet,
  then **Send** says "Working…" over the sent message and **Close, keeps your message** can be pressed.
