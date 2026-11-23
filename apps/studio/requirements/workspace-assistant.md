# studio.workspace-assistant

- Status: active
- Since: unreleased
- Source: HAL-16796 (T14 PR 6b); flow-assistant 3.1, 3.6, 5.2 and 5.4 (HAL-647); states H13, D4 and K3 (HAL-5896, HAL-1307); the T14 plan (HAL-1307)

When the desktop app opens a folder, it shall give the Assistant feature the folder's Assistant. It shall answer a Build chat's message on the engine's chat service, as the Try it chat does, with the Build chat's tools (`list_files`, `read_file`, `schema`, `validate`, `propose_file`, `propose_delete`) made once for each chat, and with `assistant.maxSteps` from `workspace.yaml` as its model call limit, else the Settings › Assistant model call limit. A new Build chat shall start on the Assistant model when the workspace sets its own assistant model or Settings › Assistant has a provider and a model, else on the model of the most recently used Build chat, else on the alias `default`. A turn on the Assistant model shall use the workspace's own alias first, else the Settings › Assistant provider, model, address and the name of its key (never the key), else the alias `default`. The person's message shall be kept only once the engine has taken the answer, so a refused answer leaves the chat as it was; a chat shall be a draft until its first message, titled from it. What the tools write shall be changes to review of that chat. While a chat is answering, a second answer in it shall be refused as `conflict`. When the window's engine connection says the engine stopped answering during an answer, the app shall stop the answer and end it as failed with `EngineNotAnswering`, saying whether a tool already ran.

## Examples

- Given Settings › Assistant's model call limit is 9, when a Build chat answers "Add a routine",
  then the chat service gets the six Build tools and 9 turns, and the chat is titled "Add a routine".
- Given `workspace.yaml` sets `assistant.model: smart`, when a new Build chat answers,
  then it starts on the Assistant model and its turns use the alias `smart`.
- Given only Settings › Assistant's Anthropic model with the key name `ANTHROPIC_API_KEY`,
  when a Build chat answers, then its turns name that provider, model and key name.
- Given the engine refuses the answer before any turn, then the chat stays an empty draft.
- Given the model calls `propose_file` for `notes/plan.md`, then the file is written and listed to review for that chat.
- Given a tool ran and the shell then finds the engine stopped, then the answer ends as failed with `EngineNotAnswering` and `toolsRan`.
