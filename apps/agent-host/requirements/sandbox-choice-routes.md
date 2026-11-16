# agent-host.sandbox-choice-routes

- Status: active
- Since: 0.1.0
- Source: HAL-10796; HAL-5405 (Studio's onboarding reads the choice); `app.sandbox-choice`

When Studio asks which sandbox runs, the agent host shall answer the `SandboxChoice` of its choice service as codes, with the trust check run on the first ask and the latest choice after that. When the shell tells it that the person's setting changed, the host shall choose again from the setting saved in its profile and answer the new choice. The host shall take nothing about the setting from the caller, shall never save, change or remove the setting, and shall never download a backend. When the saved setting can't be read or isn't valid, then the host shall answer 500 `sandbox_choice_failed` and shall not take that for "no setting".

## Examples

- Given a host that has not chosen yet,
  when Studio asks twice,
  then the choice is started once and both answers are the same.
- Given a host that has not chosen yet,
  when two asks arrive together,
  then the choice is started once.
- Given a first ask that failed,
  when Studio asks again,
  then the start is tried again.
- Given the shell saved a new setting,
  when it posts `{}` to `settings-changed`,
  then the host chooses again and answers the new choice.
- Given a post to `settings-changed` with a setting in its body,
  then the answer is 400 and nothing is chosen.
- Given a saved setting that can't be read,
  when Studio asks,
  then the answer is 500 `sandbox_choice_failed`.
- Given a request without the launch token,
  then the answer is 401.
