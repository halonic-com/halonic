# @halonicjs/adapter-coding-tools

The coding tools server that a harness program, such as Claude Code, starts
inside its sandbox as a stdio MCP server. Its tools let a coding agent do in
one call what otherwise takes many small steps: `read_ranges` reads several
files or line ranges at once, `search` finds a text or a regular expression,
and `repo_map` lists the packages and their main source files. `run_tests`
follows in its own pull request.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-coding-tools`

## Where it runs, and why that is safe

The server is a child of the harness program, inside the same fence, with
the same files, network and limits. Everything it does, the agent could
already do with its own shell or `Read`. Its own rules come on top:

- **Paths:** every path is read from the agent's working folder, and both the
  path as written and where its links lead must stay in it
  (`coding-tools.paths`). Only `read_ranges` may also read the server's own
  test log folder. A named pipe or a device is refused, not waited on.
- **No git, no ripgrep:** `search` and `repo_map` walk the files themselves
  and read `.gitignore` with `@halonicjs/std`'s path patterns. Starting git
  would run what the repo's own config names, such as `core.fsmonitor`.
- **Regular expressions:** a match runs as a fixed script in an empty `vm`
  context with a one-second limit per file, so `(a+)+$` can't hang the server.
- **Caps:** every answer holds at most 24,000 characters, and every cut says
  how to ask for the rest.
- **Its own code:** the server refuses to start when its runtime or any file
  or folder of its code can be changed from where it runs.
- **Its output:** one JSON-RPC reply per line on standard output, and nothing
  else.

## Example

```ts
import { runCodingToolsServer, writeProbeOnThisComputer } from "@halonicjs/adapter-coding-tools";
import { Readable } from "node:stream";

// The runtime's `coding-tools` mode; the harness starts it in the agent's working folder.
await runCodingToolsServer(
  {
    args: ["--temp-folder", sessionTempFolder],
    cwd: process.cwd(),
    codePaths: [process.execPath, installFolder],
    reportError: (error) => console.error(error),
    probe: writeProbeOnThisComputer,
  },
  {
    input: Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
    write: (line) => process.stdout.write(`${line}\n`),
  },
);
```

Wiring it into the harnesses (the runtime mode, the sandbox profile, Claude
Code's and Codex's MCP settings) is a later pull request (HAL-16753).
