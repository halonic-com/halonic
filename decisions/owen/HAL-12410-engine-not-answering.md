# Decision: a host that isn't running is the engine not answering

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12410
- Kind: user-visible

Sofia's UX check (HAL-12390, row G2) asks that a Studio screen say "the engine isn't answering.
It may still be starting." with **Try again** when the agent host isn't running, instead of
"Halonic ran into a problem it can't explain yet." Screens already word `EngineNotAnswering`
(`studio-shell`) that way, but the transport rejected the shell's `host_unavailable` refusal as an
`AgentHostError`, whose `kind` isn't an error kind, so every screen read it as `internal`.

The transport now rejects `host_unavailable` with `AgentHostNotAnswering`, an
`EngineNotAnswering` (kind `unavailable`) that keeps status `0`, the code `host_unavailable`, the
shell's sandbox `reason` and the refusal itself as `cause`. Every other shell refusal stays an
`AgentHostError`.

`services.agent-host-transport` changes for that one refusal: its sentence names the exception and
points to the new `services.agent-host-not-answering`, and its `host_unavailable` example now uses
`unknown_route`. In its test, the first refusal case uses `unknown_route` for the same reason, and
the sandbox reason case reads `code` instead of `kind`. No test is removed, and none checks less;
two tests are added under the new requirement. Summarize (`apps/studio`) treats the new error as
"host unreachable", as it treated a status `0` refusal before.

## Covers

- services.agent-host-transport
