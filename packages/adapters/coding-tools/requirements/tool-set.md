# coding-tools.tool-set

- Status: active
- Since: unreleased
- Source: HAL-16752 (plan HAL-16737; Liam's conditions on HAL-16748)

The coding tool set shall offer `read_ranges`, `search` and `repo_map`, each marked as only reading, and shall name the tools that only read, so a harness may allow just those without asking. A call to a tool it doesn't offer shall get an error result that names the tools it does offer, and a call a tool refuses shall get an error result with the refusal's text. Every answer shall hold at most 24,000 characters. A failure that isn't a refusal shall reach the MCP server as a failure, so the model never reads its text.

## Examples

- Given a tool set,
  when the client lists the tools,
  then it gets `read_ranges`, `search` and `repo_map`, and all three are named as only reading.
- Given a call to `delete_files`,
  when the set answers,
  then the error result names the tools it offers.
