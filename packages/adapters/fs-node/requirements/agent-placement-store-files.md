# fs-node.agent-placement-store-files

- Status: active
- Since: 0.1.0
- Source: stack 3 of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan) (the `fs-node` adapter follows once `adapters/fs-node`, HAL-1635, is merged); `AgentPlacementStore` port v1

The file placement store shall keep each agent's "this computer" choice as one JSON file in the folder it is given, named by the lower-case hex SHA-256 of the JSON of `[location, agent]` as UTF-16 code units (little-endian) and `.json`, with the location and the agent as the file's first keys. It shall create the folder with mode `700` and each file with mode `600`, and write a choice through a temporary file and a rename. A folder that doesn't exist yet shall hold no choices. When a choice can't be read, or holds another agent's key, `get` shall throw naming the agent and its workspace. `remove` shall delete the file without reading it. The adapter shall pass the `contracts.agent-placement-store` suite.

## Examples

- Given a choice for the agent `coder` in `/Workspaces/Café`,
  when the folder is read,
  then it holds one file named by the SHA-256 of `["/Workspaces/Café","coder"]`, starting with that location and agent.
- Given a choice for the location `/a/` and the agent `b`,
  when the choice for the location `/a` and the agent `/b` is read,
  then there is none.
- Given `coder`'s choice copied over `writer`'s file,
  when `writer`'s choice is read,
  then it throws naming `writer`, and `coder`'s choice still reads.
- Given a choice file that holds only `{`,
  when it is read,
  then it throws naming the agent and its workspace, and `remove` deletes it.
