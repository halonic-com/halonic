# agents.chat.saved

- Status: draft
- Since: unreleased
- Source: HAL-16812; T14 (HAL-1307) plan; flow-assistant 5.4; Liam's answer on HAL-16788 (Q2) and HAL-17670; Ravi's answer on HAL-17669

Where the workspace's chats are saved, the Try it chat shall be saved at the end of each turn as a chat of kind `agent:<hub>/<id>` in the same store and list as the Build chats, by their rules: never while it is a draft, titled from its first message, and only the workspace's 40 most recently used chats kept, Build and agent chats together. Only its conversation shall be saved; a message the engine refused because the workspace isn't trusted (H16) shall not be. When the agent's page opens again, its most recently used Try it chat shall come back with its messages in order, rebuilt from the conversation, and its next message shall be answered by the agent as it is saved now. Where chats aren't saved, the Try it chat shall live as long as its page.

## Examples

- Given a workspace with a saved Build chat, when the person sends "Sort today's mail" to Sorter and the reply ends,
  then the workspace's chat list holds the Build chat and a chat of kind `agent:acme/sorter` titled "Sort today's mail".
- Given that chat, when Sorter's page closes and opens again,
  then the chat shows "Sort today's mail" and Sorter's reply, in that order.
