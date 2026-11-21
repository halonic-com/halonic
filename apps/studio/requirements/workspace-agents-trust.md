# studio.workspace-agents-trust

- Status: draft
- Since: unreleased
- Source: HAL-13177; Sofia's design check C516 (HAL-14955), S-3; states (HAL-5896) section 4, H16; `agents.chat.not-trusted`

When the desktop app gives the Agents feature a folder's agents, it shall give them the workspace's trust: whether the workspace may start anything now, the window's trust check, and the workspace's name, so a Try it message sent in a workspace this computer doesn't trust opens the trust check and Not now names the workspace in its toast. The engine shall still refuse such a message itself (`studio.workspace-agents-chat`). Where there is no folder to trust, the agents shall have none of the three.

## Examples

- Given the folder "Acme" that this computer doesn't trust, when the Agents feature asks whether it may start, then the answer is no, and asking for trust opens the window's trust check and answers what the person picked.
- Given the folder "Acme", when the Agents feature asks for the workspace's name, then it is "Acme".
- Given no folder to trust, then the agents have no trust check, no answer to whether they may start, and no workspace name.
