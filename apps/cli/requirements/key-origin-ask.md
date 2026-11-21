# cli.key-origin-ask

- Status: active
- Since: unreleased
- Source: HAL-11873 (step B c of HAL-11343: the "Allow this address?" prompt; the pause rules in Liam's answer of 17 Nov on HAL-11873)

When a model call is refused because its stored key may not go to the provider's address (`key-origin-not-allowed`, requirement `cli.workspace-provider-key-trust`), the refusal shall give the provider, the key's name and the address as its cause's detail, never the key's value. A host may then ask a person whether to allow that address, only when it says a person can be asked about the call. The address it saves shall be the one from its own check, never one the person's window sends. It shall ask once per call and write the answer to the run's log as `key-origin.answered` (`allowed` or `not-allowed`). After `allowed` it shall pick the model once more, with every check made again; after `not-allowed`, when the call is stopped, when the question can't be asked, or after 10 minutes without an answer, the call shall fail with the refusal, and only an answer is written to the log. Any other error shall pass unchanged, and nobody is asked.

## Examples

- Given a refusal of key `fake-key` to `https://gateway.example.com` by provider `gateway`, and a host that may ask,
  when the person allows the address,
  then the host saves `https://gateway.example.com` for `fake-key`, the log has `key-origin.answered` with `allowed`, and the model is picked once more.
- Given the same refusal,
  when the person doesn't allow it,
  then the call fails with the refusal, and the log has `key-origin.answered` with `not-allowed`.
- Given a host that may not ask, such as for a scheduled run,
  when the call is refused,
  then it fails with the refusal, nobody is asked, and the log has nothing new.
- Given a question with no answer,
  when 10 minutes pass or the call is stopped,
  then the call fails with the refusal, the question is told to close, and the log has nothing new.
- Given an address allowed and a second pick that is refused again,
  then the call fails with that refusal, and the person was asked once.
