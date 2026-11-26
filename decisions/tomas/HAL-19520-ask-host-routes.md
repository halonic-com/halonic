# Decision: quick ask's box reaches only three agent host routes

- Approval: follow-up from Julian's security review of #6404 on HAL-19448 (https://paperclip.halonic.com/HAL/issues/HAL-19448), tracked on HAL-19520 (https://paperclip.halonic.com/HAL/issues/HAL-19520); Julian reviews the security and Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:45dl7HJuR4NpF7qqBJq9BF2ic2/MUsRwb7pXt4OalLvWirZ1GiStU3xsNumMe4etEcNnTM/g8SuGBEH48BtnDw==

## What changes

Pull request #6404 (HAL-19004) granted the box's window only the six commands its page calls, `agent_host_request` among them. But that command accepted any route of the agent host's table, whichever window called it, so a compromised box page could still reach everything the Messenger window can: sandbox sessions, setup and removal, harness runs, plugin and connector calls, Google secret saves and pairing codes. The box is the one window that opens over other apps, and its page needs only three of those routes.

- **The shell refuses the box every other route.** `agent_host_request` now takes the calling webview, and from the window labelled `ask` it refuses any route but `POST /v1/messaging/read`, `POST /v1/messaging/send` and `POST /v1/messaging/changes` as `not_for_the_box`, before it starts or calls the host and before the native asks for unfenced runs and phones. Studio's, the Inbox's and Messenger's windows keep the whole table. The box doesn't get `agent_host_stream` at all, so its stream routes need no check.
- **Why those three:** the box's page asks through Messenger's chats with the readers of `provideAgentMessagingReaders`: `read` lists the chats, their messages and cards, `send` sends the question, and `changes` waits for the answer. It doesn't send `focus`, which only Studio's windows send.
- **A requirement changes its wording:** `studio.src-tauri.quick-ask-window` adds that the `ask` window's `agent_host_request` is refused as `not_for_the_box` for any route but those three, and leaves every other window the host's whole table, with an example. It also said the box got "nothing to read or change the keys". `host_settings_read` returns every host setting, `quick-ask.shortcut` included, so the box can read its saved keys. It now says "nothing to change the keys (`host_settings_read` shows the saved ones)" (Julian's first [nit]). The capability's description says the same.
- **Two test helpers change, no test is weakened.** `request` in `agent_host_tests.rs` and `agent_host_messaging_tests.rs` now calls the command from Studio's window, since it takes a webview instead of the app; every assertion stays as it was. `every_capability()` in `quick_ask_tests.rs` now asserts that each file holds one capability object with an identifier, since Tauri also reads a list from one file, which `reaches_the_box` would skip (Julian's second [nit]). Every file in the folder already does.
- **The stream tests move, unchanged.** `agent_host_tests.rs` was at 490 lines, and the new module's line pushed it past what a pull request may grow a file to, so its six stream tests move as they are to `agent_host_stream_tests.rs`, a module inside it.

## Covers

- studio.src-tauri.quick-ask-window
- apps/studio/src-tauri/capabilities/desktop-quick-ask-box.json
- apps/studio/src-tauri/src/agent_host_tests.rs
- apps/studio/src-tauri/src/agent_host_stream_tests.rs
- apps/studio/src-tauri/src/agent_host_messaging_tests.rs
- apps/studio/src-tauri/src/quick_ask_tests.rs
