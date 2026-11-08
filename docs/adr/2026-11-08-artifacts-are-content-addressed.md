# Artifacts are content-addressed

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Runs produce files: documents, attachments, tool output. The same file often
appears in many runs, and the event log must stay small and readable.

## Decision

An artifact is stored once as a blob, named by the hash of its content, and a run
event links to it by that name. The event log holds the link, never the bytes.

The hash is SHA-256. The core has no hash code of its own: it asks the
platform's WebCrypto through a port.

## Consequences

- Identical files are stored once, and a link can't point at changed content.
- Blobs are not part of the tracked definitions and are ignored by git, like the
  event logs.
- Where blobs are kept is a port, so a cloud target can use object storage.
