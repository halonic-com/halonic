# agent-host.doctor-route

- Status: active
- Since: unreleased
- Source: HAL-13407 (Liam's decision of 21 Nov: a security PR, its rules and the lines it answers); first-run-progress task 4 on HAL-7986; HAL-13406 (the facts and ids); HAL-13405 (the 5-second limit on each check)

When Studio asks the agent host to check this computer, with or without a workspace folder the launcher named, the agent host shall run `halonic doctor`'s own checks (`adapter-doctor-node`) on its sandbox, its harnesses, the profile's trust records and run folders, and the model servers the workspace runs on this computer, and answer each line's facts, its `check`, its `status` and the actions it offers, without words. It shall answer the Workspace, Models, Sandbox, Harnesses, Network and Disk lines, and shall leave out the key lines, Node.js, Default model and Last run, which Studio's page builds itself. It shall write nothing in the profile or the workspace: it reads the trust records without saving a record the check shrinks, and it doesn't ask an agent's own sign-in, which runs the harness program on a settings folder in the profile. It shall ask a model server at an address other than this computer's only once the workspace is trusted here, shall never call a cloud provider and shall run no model test. It shall run one check at a time: while one runs, another call shall get 429 `busy` and not wait. A folder the launcher didn't name shall get 404 `unknown_workspace`, a named folder without `workspace.yaml` 404 `no_workspace`, and a check that throws 500 `doctor_failed` with a fixed message; neither the answer nor the log shall hold an error's own text, a token, a key, an environment variable or a program's output.

## Examples

- Given a call without a workspace,
  then the answer has the Sandbox, Harnesses and Disk lines, each with its actions, and their counts.
- Given the workspace `acme` with an Anthropic provider, Ollama on `localhost` and LM Studio at `10.0.0.5`, not trusted here,
  when Studio asks with its folder,
  then the answer has the Workspace line (`trust: new`, `review-trust`), the Models line with only the servers on this computer, and no line or fact about Anthropic; only Ollama was asked.
- Given the same workspace trusted here,
  then LM Studio at `10.0.0.5` is asked too, and Anthropic still isn't.
- Given a trusted workspace whose LM Studio provider file was removed since,
  then the Workspace line says trusted, and the trust record and every file and folder of the profile and the workspace are as they were.
- Given a folder the launcher didn't name, or a named folder without `workspace.yaml`,
  then the answer is 404 `unknown_workspace` or 404 `no_workspace`.
- Given a check still running,
  when Studio asks again,
  then the answer is 429 `busy`, and once the first has finished the next call is answered.
- Given trust records that throw an error quoting a key,
  then the answer is 500 `doctor_failed`, and neither it nor the log quotes the key.
- Given a body with any field but `workspace`, or a relative folder, or no launch token,
  then the answer is 400, 400 or 401.
