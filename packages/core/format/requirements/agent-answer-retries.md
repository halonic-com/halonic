# format.agent-answer-retries

- Status: active
- Since: unreleased
- Source: HAL-16441, Liam's task for HAL-16440 (model-mix trials, Timothy's decision of 22 Nov)

When `parseFile` reads an agent file, the format shall accept an optional `answerRetries` field, a whole number from 0 to 1, and leave it out when the file does, so older files read as before. Any other value fails at that field.

## Examples

- Given an agent with only an id and a name, when it is parsed, then it has no `answerRetries`.
- Given `answerRetries: 1`, when it is parsed, then `answerRetries` is 1.
- Given `answerRetries: 0`, when it is parsed, then `answerRetries` is 0.
- Given `answerRetries: 2`, `answerRetries: -1` or `answerRetries: 0.5`, when it is parsed, then it fails at `answerRetries`.
