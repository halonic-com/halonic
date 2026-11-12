# Decision: `inheritEnv` follow-up from Liam's review of halonic#1976

- Approval: Paperclip task HAL-6654 (Liam's review of halonic#1976 and halonic#2057; design on HAL-6266)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Mn9Vw+WvXjWsFWKpzLaInR+Zdo1BpjX3E4WAPFhi1ltIT/g+RlfIyQjSDIaWeYhs8aLo2FTOXcGlrkJqpQk5BA==

Liam's review of halonic#1976 left four small points for after the launch change (halonic#2057). This
change makes them, each with its own example and test.

- `workspace.trust-content`: `inheritEnv: []` is no `inheritEnv`, so writing an empty list doesn't
  ask for trust again. One clause and one example.
- `contracts.trust-fingerprint`: taking a variable with `inheritEnv` changes the fingerprint; naming
  the same variables in another order, or writing an empty list, doesn't. One attack and two
  controls.
- `format.connector-inherit-env`: a name written twice, in any letter case, fails with
  `inherit-env-duplicate`, since Windows reads `Aws_Profile` and `AWS_PROFILE` as one variable. One
  clause and one example.
- `app.package-runner-launch`: a pinned connector may name a variable the base already gives on every
  platform, as written, such as `HTTPS_PROXY` or `HOME`, since the pinned launch keeps it anyway. A
  name the base doesn't give, or one written in another case such as `Https_Proxy`, is still
  refused. One clause and one example.
- `ports.listed-tool-approval`: a `stdio` tool approval's server address holds the `inheritEnv`
  names, sorted, only when there is one, so approvals given before `inheritEnv` stay valid and adding
  a name asks again. One clause and one example; the approval-store contract checks the stored form.

Nothing is removed and no test is removed or weakened.

## Covers

- workspace.trust-content
- contracts.trust-fingerprint
- format.connector-inherit-env
- app.package-runner-launch
- ports.listed-tool-approval
