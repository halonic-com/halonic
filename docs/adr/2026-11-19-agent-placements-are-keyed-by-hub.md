# The AgentPlacementStore port is at version 2: a choice is keyed by hub too

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

An "On this computer" choice was stored under the workspace's real path and
the agent's id. Agent ids are unique only within a hub, so two hubs in one
workspace with an agent called `writer` shared one choice. With identical
agent files (a copied hub, a template), choosing for one let the other out of
its sandbox, though that hub can give the agent other tools, connectors and
knowledge. With different files, the other agent showed "confirm again" for a
choice nobody made for it (Julian, HAL-13203). We looked at keying by the
agent file's path instead, but the engine and the CLI ask by hub and agent id,
not by path, and a path changes when a person renames a folder.

## Decision

`agentPlacementStoreVersion` is 2. `AgentPlacementKey` is `{ location, hub,
agent }`, and an `AgentPlacementRecord` holds the hub. `isAgentPlacementFor`
accepts a record only with exactly these fields, the hub included, and the
hub asked for. The file store names a choice by the hash of
`[location, hub, agent]`. The agent host's placement routes require `hub`
and refuse a body without one; they never default it.

Choices saved by version 1 are not migrated. Their file name is the hash of
`[location, agent]`, so version 2 never finds them, and a hub-less record is
refused anyway. The agent runs in its sandbox until the person chooses again,
which the existing "confirm again" state covers.

## Consequences

- People who chose "On this computer" before this change choose again once.
  It fails closed: no agent leaves its sandbox on a guess at its hub.
- Version 1 files stay in the profile's placements folder, unread. Nothing
  cleans them up yet.
- The contract suite keeps the same agent id in two hubs apart, and keeps a
  hub id from running into the location or the agent id.
- Everything that builds a key (`AgentPlacement` in `core/app`,
  `FilePlacementPolicy`, the CLI's sandbox check, the agent host and its
  client) passes the hub the agent is in.
