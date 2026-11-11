# @halonicjs/host-harness-host

Builds what the engine needs to run agents in harnesses: its
`HarnessRunsOptions`, and the proposal folders its top-level runs write
files in. It takes ports only, so the Node parts stay with the caller and
the CLI and the Studio's host build the same thing from their own parts.

- **Layer:** host
- **Owner:** tomas
- **Public API:** `@halonicjs/host-harness-host`

## What it gives you

| Export | What it does | Requirement |
| --- | --- | --- |
| `harnessHostOf` | builds `{ harnesses, proposalFolders, start }` from the host's sandboxes, harnesses, bridge server, services, profile builder, person's choices, agent files and proposal parts | `harness-host.builder` |
| `FilePlacementPolicy` | the engine's `PlacementPolicy` on `AgentPlacement`: reads the agent's file as it is on disk and answers `sandbox`, or `this-computer` when a person chose that for those bytes | `harness-host.placement` |
| `AgentFiles` | the port it reads agents' files through, by hub and id, as raw bytes | `harness-host.placement` |
| `LocalBridgeHost` | the engine's `HarnessBridgeHost` on the `HarnessBridgeServer` port, with what `servicesFor` gives the agent | `harness-host.bridge` |
| `BridgeServicesSource`, `BridgeServices`, `BridgeAgent` | the `servicesFor(agent)` port: providers, prices, tools and approvals, the same shape as the Studio's `AgentHostBridges` takes, without keys | `harness-host.bridge` |
| `HistoryProposalFolders`, `ProposalsNeedHistoryError` | refuses a run with no version to start from on a host without run copies, when its folder opens, with an error that says how to turn history on | `harness-host.history-off` |
| `refusingApprovals`, `HarnessApprovalsNotWiredError` | approvals for a host that can't ask a person yet: each request fails with its own error | `harness-host.not-wired` |
| `refusingTrash`, `ProposalAcceptNotWiredError` | a trash for a host without Accept: moving or restoring fails with its own error | `harness-host.not-wired` |

The bridge services carry no keys: the bridge server reads them itself, so
they never pass through this package. A model's price comes only from the
prices' own entries, so a model named `toString` has none.

## Where it is wired

- **CLI:** `apps/cli` passes its Node parts: the srt sandbox, the host
  sandbox, the Node bridge server, the harness profiles, git with worktrees
  in the profile and the folder's files.
- **Studio:** `packages/studio/*` may not import host packages. When the
  Studio runs harness agents, `apps/studio` or `apps/agent-host` wires this
  with the agent host's stand-ins.

Call `start(openRuns)` once when the engine opens, before it starts any run.

## Example

```ts
import { harnessHostOf, refusingApprovals, refusingTrash } from "@halonicjs/host-harness-host";

const host = harnessHostOf({
  sandboxes: { sandbox: fencedSandbox, "this-computer": hostSandbox },
  harnesses: { "claude-code": claudeCode },
  bridgeServer,
  services: { servicesFor: () => ({ providers, prices, tools, approvals: refusingApprovals }) },
  profiles,
  home,
  placement: { store: placements, location: workspaceRealPath, files: agentFiles },
  digest,
  clock,
  proposals: { vcs, copies: null, records, store, trash: refusingTrash, onEndFailed },
});
const engine = localEngine({ ...options, harnesses: host.harnesses, proposalFolders: host.proposalFolders });
await host.start(openRuns);
```

## Requirements

- [`harness-host.builder`](requirements/builder.md)
- [`harness-host.placement`](requirements/placement.md)
- [`harness-host.bridge`](requirements/bridge.md)
- [`harness-host.history-off`](requirements/history-off.md)
- [`harness-host.not-wired`](requirements/not-wired.md)
