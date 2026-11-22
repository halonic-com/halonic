# Choose which connector tools ask first

A connector gives agents the tools of an MCP server, a built-in service such
as Gmail, a local integration or a plugin. By default, every call an agent
makes to one of those tools waits for a person to approve or reject it. A
run stops and waits for that OK; a chat turn, which can't wait, refuses the
call.

To let a tool run without asking, name it in the connector file's
`tools.read` list. Do that only for tools that change nothing.

## The rule

Every call to a connector tool asks a person first, unless both of these
hold:

- the connector file's `tools.read` names the tool exactly, and
- the file's `tools.approve` doesn't name it, and isn't `all`.

Two more things always win:

- A tool its server lists as `send` always asks, even when `tools.read`
  names it, but only once sending is on for its connector. While sending is
  off, a run refuses the call without asking. For a Google connector, switch
  it on with `halonic google allow-sending <connector> on`: the runs of
  `halonic run`, `halonic runs send`, `halonic serve` and
  `halonic routines watch` read that choice. Studio's runs don't read it yet,
  so they refuse every `send` call, and so does a CLI run for a connector
  that isn't a Google one. `halonic runs show` says "The call to <tool> was
  refused: sending is off for <connector>, so nothing was sent." and, under it,
  "To switch it on, run halonic google allow-sending [--dir …] <connector> on"
  for a Google connector, or "The halonic command can't switch sending on for
  it yet." for any other.
  - Studio has no Allow sending switch yet. To send through a Google
    connector, start the run with `halonic run` instead.
  - A connector that isn't a Google one can't have sending switched on
    anywhere yet: Studio has no switch, and the CLI has no command for it.
    To keep agents from trying, leave its `send` tools out of the connector
    file's `tools.allow`, and do the sending yourself outside the run.
- A tool its server lists as `read` still asks, until `tools.read` names it.
  A server, a plugin's manifest or an integration's permission sheet can make
  a tool ask, never stop it from asking.

## Set it in the connector file

The `tools` section of `library/connectors/<id>.connector.yaml` has three
lists. Each one takes the names the server lists its tools under.

```yaml
name: Files
transport:
  stdio:
    command: acme-files-server
tools:
  allow: [read_file, list_files, write_file]
  approve: [write_file]
  read: [read_file, list_files]
```

- **`allow`** names the tools agents are offered. Leave it out to offer every
  tool the server lists.
- **`approve`** names tools that always ask first, whatever `read` says.
  `approve: all` makes every tool ask, including tools the server adds later.
  A new MCP connector starts with `approve: all`.
- **`read`** names tools that run without asking. Use exact names: there are
  no patterns, and a tool you don't name still asks. Only you set this list:
  nothing a server lists can add a tool to it.

In the example, `read_file` and `list_files` run without asking, and every
call to `write_file` asks.

A tool in `approve` that `allow` leaves out is never offered to agents, so it
never asks either. `halonic validate` warns about it with
`approved-tool-not-allowed`: add the tool to `allow`, or take it out of
`approve`.

## Check what a tool does

`halonic tools review <connector>` shows one block for each listed tool that's
off until you review it, and says under it whether calls to it ask:

- "Asks you before each use."
- "Doesn't ask before each use: *workspace* marks it as read-only."

A run and `halonic tools review` use the same rule (`asksBeforeEachUse` in
`@halonicjs/format`), so what the review says is what a run does, with one
exception: for a tool its server lists as `send`, the review says "Asks you
before each use.", but while sending is off for its connector, a run
refuses every call to it without asking (see [The rule](#the-rule)).

Turning a tool on in `halonic tools review` is a separate step. It lets agents
use a tool whose name, description and arguments you have read, and the tool is
off again when they change. It doesn't stop a tool from asking before each use.
