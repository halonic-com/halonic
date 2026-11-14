# contracts.target-capabilities

- Status: active
- Since: 0.1.0
- Source: HAL-6803; multi-cloud ADR 5.5 and 5.9

Where a deployment target declares that it can't start programs, use git, edit its workspace files or set secrets, it shall wire no port for starting programs or for git, shall hand out definitions without `write`, `remove` or `watch`, and shall hand out secrets without `set`, `remove` or `names`, so that nothing a stolen session can call changes what runs.

## Examples

- Given a target that wires a `vcs` port, then the suite fails and names it.
- Given definitions that have a `write` method, then the suite fails and names it.
- Given secrets that have a `set` method, then the suite fails and names it.
- Given a read-only `get` for secrets and a `list`, `read` and `version` for definitions, then the suite passes.
