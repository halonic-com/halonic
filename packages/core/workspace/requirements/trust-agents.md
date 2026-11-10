# workspace.trust-agents

- Status: active
- Since: 0.1.0
- Source: plan v1.17 and plan 11 (new trust-prompt lines: harness programs, allowed sites); stack 3c of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved with changes by Liam on HAL-1967

The workspace package shall add each agent whose harness isn't Halonic's own loop to the trust content, sorted by id, with its harness, its allowed sites in their stored form (lowercase, Punycode, each once, sorted) and its working folder, normalised, when it isn't `files/agents/<id>`. Agents without a harness or with `halonic` add nothing, and a workspace without harness agents shall have the same content and fingerprint as before. The trust changes shall list harness agents that are new, changed (with the fields that differ) and removed, and a change that only removes whole harness agents, or connectors, shall be the only kind that shrinks the record without asking.

## Examples

- Given an agent `coder` with the harness `claude-code`, the sites `*.Example.com` and `bücher.example` and the folder `files/agents/coder/`,
  then the content lists it with `*.example.com` and `xn--bcher-kva.example`, and without a working folder.
- Given only agents without a harness or with `halonic`,
  then the content and fingerprint are the same as a workspace's without agents.
- Given a trusted harness agent,
  when another harness agent is added, or its harness, a site or its folder changes, or a site is removed,
  then the fingerprint changes and the change doesn't only remove things.
- Given a trusted harness agent,
  when its sites are reordered or written in capitals,
  then the fingerprint stays the same.
- Given a trusted harness agent `coder`,
  when it goes back to Halonic's loop,
  then it is listed as removed and the change only removes things.
- Given a trust record from before harness agents existed,
  when the workspace now has one,
  then it is listed as new.
