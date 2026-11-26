# paperclip.front-bot-grounding

- Status: active
- Since: unreleased
- Source: HAL-18847 section 7, point 1 (Liam's review, 25 Nov), and the voice rules in section 4.1

When the front bot has a first reply to post, the Agent tools plugin shall first check it in plain code, without a model, against the exact text it sent, and shall reject it with one fixed reason code when it holds text shaped like a key or token, including the shapes the repo's leak guard knows (`secret_shape`), names a credential such as a key, token or password, including an identifier that ends in key, token, secret or password such as `PAPERCLIP_API_KEY` or `deploy-token`, or asks the reader to paste, send, share, provide, enter, post, type, give or upload something (`credential_request`), has more than 30 words or 240 characters (`too_long`), is a bare acknowledgement such as "On it." (`bare_acknowledgement`), starts by answering yes or no (`unhedged_answer`), says "I", "me" or "my" (`first_person`), says "safe" or holds an exclamation mark or emoji (`banned_word`), promises a time (`time_promise`), names a number or time not in the input (`unknown_number`), a link not in the input (`unknown_link`), or a capitalised name not in the input and not on the fixed list of common words (`unknown_name`), or holds a result word such as "merged", "done", "fixed", "passed" or "deployed" that is neither negated ("Not done yet.") nor found in an earlier comment the bot was shown whose own time the reply names; the task title and the new message never count (`result_word`).

## Examples

- Given a message "Is #6129 merged yet?", when the reply is "PR #6129 is merged.", then it is rejected with `result_word`.
- Given a message "Is #6129 merged yet?" and an earlier comment "Looking at it." at 13:52, when the reply is "PR #6129 is merged as of 13:52.", then it is rejected with `result_word`.
- Given a request "Put Leo's video on the 0.3 release card", when the reply is "Request: Leo's explainer on the 0.3 release card. Not done yet.", then it passes.
- Given Chief's comment "PR #6129 merged at 13:40.", when the reply is "About PR #6129. Chief wrote at 13:40 that it merged.", then it passes.
