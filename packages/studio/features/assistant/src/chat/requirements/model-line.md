# assistant.chat.model-line

- Status: active
- Since: unreleased
- Source: HAL-17334 (T14 PR 7b); states H18, H19 and H20 (HAL-5896); flow-assistant 5.2, 5.9 and 7 (HAL-647); microcopy 14.1 (HAL-751)

When a Build chat's model can't be used, the panel shall say why on a `warning` line under the box, with the triangle, and the message in the box shall stay. When the workspace has neither an Assistant model nor a model alias, the line shall be "The assistant has no model yet. Add a model alias or choose an Assistant model in Settings › Assistant." with **Settings ›**, which opens Settings › Assistant. When the chat's model needs an API key that isn't stored, the line shall be "The assistant has no model it can use: `smart` needs an API key for Anthropic." with the model's name as code and **Set the key ›**, which opens the workspace's Models. On these two lines Send shall stay enabled: pressing it shall send nothing, read the models again and put focus on the line's link, or on the box when the model can be used now. When the chat's model is a cloud model and the workspace is local only, the line shall be "Acme is local only, so the assistant can't use smart. Pick a local model." without a link, and Send shall wait with that line as its reason. An agent chat and a model that can be used shall show no such line.

## Examples

- Given a workspace with no Assistant model and no model alias, when the person types "Add a routine" and presses Send,
  then nothing is sent, the text stays, and focus is on **Settings ›**.
- Given the chat uses `smart`, whose Anthropic key isn't stored,
  then the line reads "The assistant has no model it can use: smart needs an API key for Anthropic." and **Set the key ›** opens Models.
- Given that line, when the key is stored and the person presses Send,
  then the line goes, focus is on the box, and the next Send sends the message.
- Given Acme is local only and the chat uses the cloud alias `smart`,
  then the line reads "Acme is local only, so the assistant can't use smart. Pick a local model." and Send names it as its reason.
