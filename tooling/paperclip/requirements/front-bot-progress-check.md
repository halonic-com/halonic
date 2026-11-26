# paperclip.front-bot-progress-check

- Status: active
- Since: unreleased
- Source: HAL-18847 section 7, point 1 (Liam's condition), applied to notes; HAL-18743 sections 4 and 10 (note rules and must-fail list); HAL-19218

When the front bot has a progress note to keep, the Agent tools plugin shall first check it in plain code, without a model, against the exact text it sent, and shall reject it with one fixed reason code when it holds text shaped like a key or token (`secret_shape`), names a credential or asks the reader to hand something over (`credential_request`), has more than 22 words or 160 characters (`too_long`), is a bare acknowledgement (`bare_acknowledgement`), starts like a list item, heading or quote or holds a line break, backtick or table bar (`list_or_heading`), holds a path, a file name, a command flag, a url or a masked value `•••` (`path_or_command`), starts by answering yes or no (`unhedged_answer`), says "I", "me" or "my" (`first_person`), says "safe" or holds an exclamation mark or emoji (`banned_word`), promises a time (`time_promise`), names a number not in the input (`unknown_number`), holds a result word that is not negated and is not "failed" or "passed" (or their forms) backed by a new step with that status (`result_word`), names a capitalised word not in the input and not on the fixed list of common words (`unknown_name`), or opens with the same three words as an earlier note of the run (`same_opening`).

## Examples

- Given a new step "Ran pnpm test (failed)", when the note is "A test run failed. Looking at which test it was.", then it passes.
- Given only a new step "Ran gh pr (running)", when the note is "The pull request is merged.", then it is rejected with `result_word`.
- Given a step "Read a file (passed)", when the note is "Reading src/index.ts now.", then it is rejected with `path_or_command`.
