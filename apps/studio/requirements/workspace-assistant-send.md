# studio.workspace-assistant-send

- Status: active
- Since: unreleased
- Source: HAL-16797 (T14 PR 7); flow-assistant 5.9 (HAL-647); states H12, H16 and D5 (HAL-5896); HAL-720; `workspace.trust.assistant-authoring-exception` condition 1 and Julian's R1 test (HAL-3268, HAL-16788)

The folder's Assistant shall say whether the window's engine connection answers now, and tell the Assistant feature each time that changes, so an open chat can say so and hold Send. It shall give the workspace's name and the window's trust check. Before a Build chat's answer sends anything, it shall pick the turn's model by where it comes from, not by its name: when the model is anything other than the person's own Settings › Assistant model (the workspace's own assistant model, or any alias of `models.yaml`, the alias `default` included) and the workspace isn't trusted, it shall refuse the answer as `WorkspaceUntrusted` and keep nothing of the message. A file the assistant writes, such as a `models.yaml` alias with the name of the Settings › Assistant model, shall not change which model the next answer uses, and shall not trust the workspace.

## Examples

- Given the engine connection reports the engine lost, then the Assistant says the engine isn't answering and tells the feature once.
- Given a workspace that isn't trusted and a chat on the alias `smart`, when the person sends "Hi",
  then the answer is refused as `WorkspaceUntrusted`, nothing reaches the chat service, and the chat stays an empty draft.
- Given a workspace that isn't trusted and the Settings › Assistant model `claude-sonnet-5-5`, when the assistant writes a `models.yaml` alias `claude-sonnet-5-5` on a provider at another address,
  then the next answer's turns still name the Settings › Assistant provider and model, with no alias, and the workspace is still not trusted.
