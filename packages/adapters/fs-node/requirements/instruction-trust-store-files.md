# fs-node.instruction-trust-store-files

- Status: active
- Since: 0.1.0
- Source: HAL-3106 slice 3b; `InstructionTrustStore` port v1

The file instruction trust store shall keep the instructions a person trusted for each agent as one JSON file in the folder it is given, named by the lower-case hex SHA-256 of the JSON of `[location, agent]` as UTF-16 code units (little-endian) and `.json`, with the location and the agent as the file's first keys. It shall create the folder with mode `700` and each file with mode `600`, and write a record through a temporary file and a rename. A folder that doesn't exist yet shall hold no records. When a record can't be read, holds another agent's key, or is a link, `get` shall throw naming the agent and its workspace, never return `null`. `remove` shall delete the file without reading it. The adapter shall pass the `contracts.instruction-trust-store` suite.

## Examples

- Given trusted instructions for the agent `coder` in `/Workspaces/Café`,
  when the folder is read,
  then it holds one file named by the SHA-256 of `["/Workspaces/Café","coder"]`, starting with that location and agent.
- Given `coder`'s record copied over `writer`'s file,
  when `writer`'s record is read,
  then it throws naming `writer`, and `coder`'s record still reads.
- Given a record file that holds only `{`,
  when it is read,
  then it throws naming the agent and its workspace, and `remove` deletes it.
- Given a record that is a link to a file in a workspace,
  when it is read,
  then it throws, and a save replaces the link without writing through it.
