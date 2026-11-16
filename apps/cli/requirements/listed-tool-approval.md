# cli.listed-tool-approval

- Status: active
- Since: 0.1.0
- Source: HAL-850 section 2 ("CLI and `serve`: the profile folder") and section 4 ("Where nobody can answer … the log and status name the command to run"), HAL-2212

The local engine the CLI opens shall check the listed tools of every connector against the approvals in the profile folder's `tool-approvals`, keyed by the workspace's resolved real path, at the address `connectorToolServer` gives, the same one `halonic tools` approves at, with the connector's pin taken from the workspace's trust record. A connector whose file is `http` or `stdio` lists tools a server wrote; the tools of any other connector (an integration's, a plugin's, the built-in Google connector's) are ones Halonic reviewed and shall pass. A connector with no file in the workspace, a trust record that can't be read, or no address to approve at shall keep its listed tools off. For the listed tools a turn leaves waiting, the command shall write one warning to stderr, with or without `--debug`, once for each connector and set of tools, that names the tools and the command `halonic tools review <connector>`.

## Examples

- Given an `http` connector `mail` whose tool `lookup` has no approval,
  when a chat turn runs,
  then `lookup` isn't offered, the response's `waiting` holds it, and the host hears `mail` and `lookup`.
- Given the same tool, approved with the address `https://mail.example.com/mcp`,
  when a chat turn runs,
  then `lookup` is offered.
- Given a `stdio` connector `notes` whose trust record pins it to `@acme/notes-mcp` 2.3.1,
  when its address is asked,
  then the address holds that pin.
- Given an integration connector,
  when its address is asked,
  then it is reviewed and needs no approval.
- Given a trust record that can't be read,
  when the address of a `stdio` connector is asked,
  then it has none, so its listed tools wait.
- Given tools that wait at every step of a run,
  when the engine tells the host each time,
  then the command writes one warning naming `halonic tools review mail`.
