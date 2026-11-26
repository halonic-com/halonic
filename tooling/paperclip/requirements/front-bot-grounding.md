# paperclip.front-bot-grounding

- Status: active
- Since: unreleased
- Source: HAL-18847 section 7, point 1 (Liam's review, 25 Nov), and the voice rules in section 4.1

Before the front bot posts a first reply, the Agent tools plugin shall check it in plain code, without a model, against the exact text it sent, and shall reject it with one fixed reason code when it holds text shaped like a key (`secret_shape`), has more than 30 words or 240 characters (`too_long`), is a bare acknowledgement such as "On it." (`bare_acknowledgement`), starts by answering yes or no (`unhedged_answer`), says "I", "me" or "my" (`first_person`), says "safe" or holds an exclamation mark or emoji (`banned_word`), promises a time (`time_promise`), names a number or time not in the input (`unknown_number`), a link not in the input (`unknown_link`), or a capitalised name not in the input and not on the fixed list of common words (`unknown_name`), or holds a result word such as "merged", "done", "fixed", "passed" or "deployed" that is neither negated ("Not done yet.") nor found in the input together with a time from the input (`result_word`).

## Examples

- Given a message "Is #6129 merged yet?", when the reply is "PR #6129 is merged.", then it is rejected with `result_word`.
- Given a request "Put Leo's video on the 0.3 release card", when the reply is "Request: Leo's explainer on the 0.3 release card. Not done yet.", then it passes.
- Given Chief's comment "PR #6129 merged at 13:40.", when the reply is "About PR #6129. Chief wrote at 13:40 that it merged.", then it passes.
