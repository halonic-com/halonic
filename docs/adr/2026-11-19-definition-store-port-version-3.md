# The DefinitionStore port is at version 3: an opt-in leaveOut

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

An agent that works in a folder of the workspace (`workingFolder: repo`)
can fill it with a project's source and an installed `node_modules`. Loading
the workspace lists every one of those files and hashes every byte of them for
the store's version, although none of them is a definition. No run records
that version, so what we pay is time and memory, not wrong records (HAL-13334).

The store can't tell on its own which folders are working folders: that takes
reading the agent files, and fs-node, fs-web and the Rust store would each have
to parse YAML. Leaving `node_modules` out of every `list()` would also change
callers that copy or compare the workspace, such as a run with history off.

## Decision

`definitionStoreVersion` is 3. `list(dir?, options?)` and `version(options?)`
take an optional `leaveOut: { folders?, names? }`. With it, a store leaves out
the given folders and every folder with one of the given names, compared as
`segmentAsOpened` gives them, and doesn't step into them. `version()` covers
only what `list()` gives with the same options, unless it names a whole
snapshot, such as a commit. Without options, both behave as in version 2.
`checkLeaveOut` and `isLeftOut` in the ports package are the rule as code, so
every store applies it the same way.

Core decides what to leave out: loading a workspace reads the agent files
first, then leaves out their working folders and `node_modules`. A left-out
file is not private: it still reads, writes and removes.

## Consequences

- A store built against version 2 still type-checks and lists everything when
  given the option, which is slower but correct. Each store opts into the
  `definitionSourceLeftOutContract` suite when it applies the option, in its
  own pull request.
- A decorator store (reviewing, try-it) has to pass the options on, or it
  quietly lists everything again.
- What the loaded workspace's version covers changes once the loader passes the
  option. Since no run records it, no history changes.
