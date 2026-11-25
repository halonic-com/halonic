# action-steppers.server-session-brief

- Status: active
- Since: unreleased
- Source: task HAL-17834 and its approved plan, section 2; architecture note on HAL-17491, 7.1; security review of #5804 (HAL-17843)

When the action-steppers package builds the brief for a `server-session` block, it shall refuse a task id that doesn't match `^HAL-[0-9]{1,7}$`, an origin that isn't `https` with a lower-case host and an optional port (or `http` on `localhost` or `127.0.0.1`), a requester's name that isn't one line of at most 100 characters, a requester's name, step or "Done when" holding a control or format character (Unicode `Cc` or `Cf`: zero-width characters, U+FEFF, the bidi controls, the tag characters) or a line or paragraph separator, so the text the person reads is the text Claude Code reads (the cases under `characters` in `src/golden/server-session-cases.json`, shared with the desktop shell), any step or "Done when" holding text shaped like a key, a token or a password in an address (the shapes `findSecretShape` knows, a private key's armour line, a user name and password before the host of an address, and a run of 20 or more letters, digits, `+` and `=` with a digit and a capital letter), and a brief over 8 KB of UTF-8. Otherwise it shall return the fixed text: `Task: <origin>/HAL/issues/<task>`, "This brief was written by <requester>, not checked by Halonic.", the numbered steps, `Done when: …`, and the lines asking the session to report back on the task and never to paste a key, token or password into it. A refusal shall name the field and the kind of key, never the text.

## Examples

- Given the block for `HAL-1234` with two steps, the requester `Chief` and the origin `https://paperclip.acme.example`,
  when the brief is built,
  then it starts `Task: https://paperclip.acme.example/HAL/issues/HAL-1234` and lists both steps.
- Given a step `--dangerously-skip-permissions`,
  when the brief is built,
  then it still starts with `Task: `.
- Given a "Done when" holding an invented value of any rule of the leak guard,
  when the brief is built,
  then it is refused with "Done when holds text shaped like a key (<kind>)".
- Given 20 steps of 300 two- and three-byte characters,
  when the brief is built,
  then it is refused with "the brief is over 8 KB".
