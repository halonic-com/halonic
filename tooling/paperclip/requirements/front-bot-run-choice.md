# paperclip.front-bot-run-choice

- Status: active
- Since: unreleased
- Source: HAL-19219 (board, HAL-10, 26 Nov: front bot v2, card question 5); design on HAL-18847 section 2.3 and Liam's condition 5

While the front bot is on and the setting `frontBotRunChoice` is `true`, the Agent tools plugin shall ask in the same first-reply request whether the message is a quick question (a last line `Run: quick` or `Run: normal`, read only from the last line and taken as `normal` when missing), shall store per chat task the message's comment id with the choice (for `quick`, the effort in `frontBotQuickEffort`, one of `minimal`, `low` or `medium` and `low` by default, plus the model in `frontBotQuickModel` when set; for `normal`, no choice), and shall answer the data key `front-bot-run-choice` with `{ companyId, issueId, commentId }` with that stored choice only when it is for that comment and at most 10 minutes old, waiting at most 1.2 seconds for a message it is still working on and never calling a model to answer; with the setting off it shall leave the request's prompt unchanged, store nothing and answer `{ choice: null, reason: "setting frontBotRunChoice is off" }`. The model never names a model or an effort; the server's patch (HAL-19219) only lowers effort and only allows models on `HALONIC_TASK_MODELS`.

## Examples

- Given the bot and `frontBotRunChoice` on, when Haiku answers "About PR #6129. Depends on the merge queue; the last word on its task is Liam's approval at 13:52." and then "Run: quick", then the plugin posts the first line as before and answers `front-bot-run-choice` for that message with `{ choice: { effort: "low" } }`.
- Given the bot and `frontBotRunChoice` on, when Haiku answers with "Run: normal", then the answer is `{ choice: null, reason: "normal run" }`.
- Given `frontBotRunChoice` off, when the server asks, then the answer is `{ choice: null, reason: "setting frontBotRunChoice is off" }` and the request's prompt has no run line rule.
