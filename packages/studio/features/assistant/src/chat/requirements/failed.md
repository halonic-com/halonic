# assistant.chat.failed

- Status: active
- Since: unreleased
- Source: HAL-16797 (T14 PR 7), HAL-17479 (T14 PR 7c); states H22, H23 and H24 (HAL-5896); flow-assistant 5.9 (HAL-647); microcopy 14.1 and 22 F7, F8 (HAL-751)

When a Build chat's answer fails, the chat shall end the reply in `danger` with the provider's own sentence, as the run page says it but ending "then try again.", and the link **Open Models ›**, when the app gives the failure's facts for a model it couldn't reach (F7) or a local model that didn't fit in memory (F8); otherwise with "Couldn't reach the model: *reason*.". When no tool call ran in that answer, it shall offer **Try again**, which continues the answer without a new message, so the chat's last message is sent again. When a tool call already ran, the line shall add "Some tool calls already ran. Send a new message to continue." and offer no Try again, because a tool may have sent something.

## Examples

- Given the model call fails with "Ollama didn't answer." before any tool ran,
  then the reply ends with "Couldn't reach the model: Ollama didn't answer." and Try again answers the chat again.
- Given a tool ran and the next model call fails with "Overloaded.",
  then the reply ends with "Couldn't reach the model: Overloaded. Some tool calls already ran. Send a new message to continue." and there is no Try again.
- Given the model alias `fast` points at Ollama at `localhost:11434`, which didn't answer,
  then the reply ends with "Halonic couldn't reach Ollama at localhost:11434 for the model alias fast. Ollama may not be running on this computer. Start Ollama, then try again." with Try again and Open Models ›.
- Given the model alias `smart` points at Anthropic and `api.anthropic.com` didn't answer (F7),
  then the reply ends with "Halonic couldn't reach Anthropic at api.anthropic.com for the model alias smart. This computer may be offline. Check your internet connection, then try again." with Try again and Open Models ›.
- Given Ollama couldn't load `llama3.1:70b` for lack of memory (F8),
  then the reply ends with "Ollama couldn't load llama3.1:70b: this computer doesn't have enough free memory for it. Close other programs, or pick a smaller model in Models." with Open Models ›.
