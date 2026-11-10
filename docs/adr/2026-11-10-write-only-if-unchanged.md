# A definition store writes only if the file is unchanged

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The save model (HAL-1102, 1.7 and 6) saves by itself and says that before
every write Halonic checks the file on disk is still the one it last read.
Another editor, a sync tool or `git pull` may have changed it, and an
autosave must not write over that. `DefinitionStore.write` replaced a file
whatever it held, so every caller would have had to read, compare and write,
with a gap in which a second write from Halonic itself could slip in. The
routing note for the save model (HAL-3236, task 3) puts the check in the
port. We looked at comparing whole texts instead of digests, but a digest is
short to keep and to send to a remote store, and a watcher can use it to
recognise its own writes.

## Decision

**`write(path, content, { expected })` and the port goes to version 2.**
`expected` is the digest of the text the caller last read, or `"absent"`
for a file that should not exist yet. The store returns `written`, or
`changed-on-disk` with the file's current text (`null` when it is gone) and
writes nothing. Without `expected` it replaces the file as before, for
setting up a new workspace and checking out a version. The Studio's saves
and proposals always pass it.

**The digest has one fixed format,** `sha256:` and the 64 lowercase hex
characters of the SHA-256 of the UTF-8 text, so a caller can work it out
from text it got elsewhere, such as a proposal's snapshot. `contentDigest`
and `matchesExpected` live in `@halonicjs/std`, because the ports package
uses no other package and core has no `TextEncoder`. Core passes the
`Digest` port in.

**The folder store writes a temporary file and renames it,** one write per
path at a time, so a reader never sees half a file and Halonic's own writes
can't race each other.

## Consequences

- Every `DefinitionStore` adapter and test double returns a `WriteResult`.
  Callers that ignore the result keep working.
- The `definition-store` contract suite gets write-if-unchanged cases, so the
  desktop and browser stores pass them when they are built.
- A program outside Halonic can still change a file in the moment between the
  check and the rename. The watcher (save model 6) reports such a change.
