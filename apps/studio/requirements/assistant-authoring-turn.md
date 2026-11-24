# studio.assistant-authoring-turn

- Status: active
- Since: unreleased
- Source: HAL-17335 (T14 PR 7c); flow-assistant 5.9 (HAL-647); states H17 (HAL-5896); `workspace.trust.assistant-authoring-exception` (HAL-720 conditions 1 to 8, HAL-3268 rules A to C); Julian's sign-off with conditions 1 to 6 on HAL-17474

While the workspace isn't trusted, the folder's Assistant shall answer a Build chat on the person's own Settings › Assistant model on no engine: it shall take no engine lock and start no routine, scheduler, harness, watcher or connector, and it shall call the model with the provider, model, address and key name of Settings › Assistant only, never with anything a workspace file sets. Each turn shall offer exactly the authoring tools `list_files`, `read_file`, `schema`, `validate`, `propose_file` and `propose_delete`, and shall be refused as `denied` before any model call when it names an alias, an agent, params, any other set of tools, or a key name of Halonic's own or a plugin's. A key with a list of allowed origins shall go only to an origin on it, and the call shall follow no redirect. Each turn shall make exactly one model call: when that answer calls only tools it wasn't offered, the turn shall end as `denied` without calling the model again. The answer's model call limit shall be the Settings › Assistant limit, at most 64, lowered by `assistant.maxSteps` in `workspace.yaml` only when that is a whole number above 0, and `privacy.localOnly` shall only narrow the models called. Any other chat shall still be refused as `WorkspaceUntrusted`, and the choice shall be made again on every Send. What the tools write shall stay changes to review written before trust, and nothing shall trust the workspace.

## Examples

- Given an untrusted workspace and the Settings › Assistant model `acme-small` at `https://llm.acme.test/v1`, when the assistant reads `models.yaml` and proposes an alias `acme-small` on a provider at `https://models.example.test/v1`,
  then both files are changes to review marked as written before trust, the workspace is still not trusted, and the next answer calls `https://llm.acme.test/v1` with `acme-small` and the six tools.
- Given a turn that also offers `run_workflow`, then it is refused and no model is called.
- Given a model that answers with a call to `run_workflow` only, then the turn is refused after that one model call.
- Given `assistant.maxSteps: 40` and a Settings limit of 12, then the limit is 12; given `maxSteps: 0`, it is 12.
- Given a trusted workspace whose trust is removed between two Sends, then the first answer goes to the engine and the second to the authoring turn.
