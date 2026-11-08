# Runs are stored separately

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

A run is a record of what happened, not a definition of what should happen. It
grows with every step, holds model output and may hold personal data. Mixing it
into the definitions would fill git history and risk publishing it.

## Decision

A run is an append-only event log, kept outside the tracked definition files and
ignored by git. Each run records the version of the definitions it started with:
a git commit, or a content hash when the workspace isn't in git. The event types
and the summaries built from them are in `@halonicjs/events`.

The log is the only source of truth. A run's position and context are rebuilt
from it, and nothing else is stored.

## Consequences

- Changing a definition never changes a run that is waiting. It keeps the
  definitions it started with.
- Where the log is kept is a port (see
  [vendor code sits behind ports](2026-11-08-vendor-code-sits-behind-ports.md)).
  A local workspace uses files, and a cloud target uses that target's storage.
- The run executor pushes events to the Studio, which subscribes to them.
  Nothing polls the log.

## Changed from an earlier decision

The Studio used to read run logs again every 10 seconds. It now subscribes to
events pushed by the run executor.
