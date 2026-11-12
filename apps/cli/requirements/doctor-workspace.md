# cli.doctor-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-2270; the `DoctorWorkspace` input of `app.doctor-service`

The `halonic doctor` command shall read from the workspace's files the workspace's name, every connector and agent for the trust check, the model aliases of `models.yaml` and of each hub, and how each provider those aliases use is reached. The test model shall need no key. A provider with `local: true` shall be reached at the host of its `baseUrl`, or at its server's default address. Any other provider shall need the key in its `secret` when it names one. A provider without a file, or on this computer at an unknown address, shall be left out together with its aliases. The command shall also read whether a run in the workspace can only reach the test model, by the rule `halonic run` skips trust by (`reachesOnlyTheTestModel`), so the Workspace line doesn't ask for a trust `run` doesn't need (HAL-6007).

## Examples

- Given `models.yaml` with smart and writer on Anthropic and local on Ollama, and a hub that points local at Anthropic,
  when the workspace is read,
  then the aliases are smart, local and writer in that order, then the hub's local on Anthropic, and the providers are Anthropic with its secret and Ollama at `localhost:11434`.
- Given the alias fast on a provider that has no file,
  when the workspace is read,
  then neither fast nor that provider is listed.
- Given the test model's file with `local: true` and no `baseUrl`,
  when the provider is read,
  then it needs no key.
- Given a workspace whose only provider is the test model, with no connector and no harness agent,
  when the workspace is read,
  then it is on the test model only; with an Anthropic provider too, it isn't.
- Given a `workspace.yaml` that doesn't parse,
  when the workspace is read,
  then its name is the folder's own name, such as `acme` when run inside it.
