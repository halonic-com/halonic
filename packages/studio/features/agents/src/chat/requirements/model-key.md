# agents.chat.model-key

- Status: draft
- Since: unreleased
- Source: HAL-18927; states (HAL-5896) section 4, H19; flow-assistant 7 and assistant.chat.model-line (HAL-17334), whose line this one follows; models flow 3.3 and ModelsService (HAL-17481)

When the agent's model needs an API key that isn't stored, the Try it chat shall show under the box, in `warning`, "*Sorter* has no model it can use: `smart` needs an API key for Anthropic." with the model's name as code and **Set the key ›**, which opens the provider's key block on Models through `ModelsService`. On that line Send shall stay enabled: pressing it shall send nothing, keep the message in the box, ask the agents host for the key again and put focus on **Set the key ›**, or send the message when the key is stored now. A reply's own buttons and forms shall send nothing while the line shows. The line shall come after a held message, the harness and the sandbox, and shall not show for a model that can be used or where the agents host can't tell.

## Examples

- Given Sorter on `smart`, an Anthropic model whose key isn't stored,
  when its chat shows,
  then the line reads "Sorter has no model it can use: smart needs an API key for Anthropic.".
- Given that line,
  when the person sends "Sort this mail",
  then nothing is sent, the text stays and Set the key › has the focus.
- Given that line,
  when the person clicks Set the key ›,
  then Models opens at Anthropic's key block.
- Given that line and the key stored since,
  when the person presses Send,
  then the message is sent.
