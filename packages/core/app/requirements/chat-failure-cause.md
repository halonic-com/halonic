# app.chat-failure-cause

- Status: active
- Since: unreleased
- Source: HAL-14935, from UX check C505-2 on HAL-14915: the Try it chat says the approved failure sentences (H22, H23) rather than "reply failed"

If a model turn of a chat answer fails with a model call error, then the chat service shall end the answer as failed with a cause that names the run failure reason a run's `run.failed` would give for the same error, the host that didn't answer when the error names one, and the error's typed cause when it has one, so the chat can say the sentence a run page says. A model turn that fails with any other error, and a listener that throws, shall end the answer with no cause, so the chat keeps its own words. Given the model the chat called, the app shall turn the cause into the same facts it gives a failed run.

## Examples

- Given Ollama at localhost:11434 can't be reached,
  then the answer ends as failed with the cause `model-unreachable` at localhost:11434, and its facts name Ollama, localhost:11434 and the alias `local`, on this computer.
- Given the provider has no key stored,
  then the cause is `key-refused`, as a run's would be.
- Given a call refused at the proxy,
  then the cause keeps the proxy's typed cause, and its facts are the proxy's.
- Given a model turn that fails with a plain error, or a listener that throws,
  then the answer ends as failed with no cause.
