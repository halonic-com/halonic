# Decision: an "On this computer" choice is keyed by hub as well as agent id

- Approval: decided by Liam on [HAL-13203](/HAL/issues/HAL-13203); the package owner (Liam) approves this note in review
- Kind: internal

## What changes

`AgentPlacementKey` is `{ location, hub, agent }` and the `AgentPlacementStore` port is at version 2
(ADR `2026-11-19-agent-placements-are-keyed-by-hub`). The requirements below now name the hub: the
port's key, the file store's file name (`[location, hub, agent]`) and error text, the contract
suite's key, the agent host's routes (a body without the hub is 400) and the client (it sends six
fields, not five). Examples were added, none removed or weakened.

Four tests were renamed, each kept with the same check or a stricter one:

- "saves exactly the five fields of the choice" is now "… six fields …".
- "keeps a location ending in / apart from an agent id starting with one" (file store) and the
  contract's lookalike of the same name now keep a location ending in `/` apart from a hub id
  starting with one, the neighbour in the new key; the contract adds the same case between the hub
  and the agent id.
- "compares locations and agent ids exactly as given" is now "compares locations, hub ids and
  agent ids exactly as given", with a hub case added.

## Why

Agent ids are unique only within a hub. Keyed by location and agent id, two hubs in one workspace
with an agent called `writer` shared one choice, so with identical files choosing for one let the
other out of its sandbox (Julian, HAL-13203). Choices saved before this change read as no choice:
the agent goes back to its sandbox and the person confirms again.

## Covers

- ports.agent-placement-store
- fs-node.agent-placement-store-files
- contracts.agent-placement-store
- agent-host.placement-routes
- agent-host-client.placement-store
- packages/adapters/agent-host-client/src/placement-store.test.ts
- packages/adapters/fs-node/src/agent-placement-store.test.ts
- packages/testing/contracts/src/agent-placement-store.ts
