# contracts.sandbox-fence

- Status: active
- Since: 0.1.0
- Source: `Sandbox` port v3 (the fence proof); code review of 11 Nov (HAL-5219)

Where an adapter implements `Sandbox`, a session whose fence proof is `not-fenced` shall say why in words, and its `start` shall throw and start no program.

## Examples

- Given a session whose canary file was readable,
  when the suite reads its fence,
  then the state is `not-fenced` and it has a reason.
- Given the same session,
  when `start` is called,
  then it throws and the adapter started nothing.
- Given an adapter that starts the program anyway,
  when the suite runs,
  then it fails and names the case.
