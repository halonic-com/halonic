# Definitions are files in git

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Agents, workflows, skills and the rest are what a team builds and reviews.
They need history, review and branching, and they must be readable without
Halonic installed.

## Decision

Everything a person defines is a plain file, YAML or Markdown, in a workspace:
one folder, usually a git repository, with each hub as a subfolder. Each kind
of file has a schema, written with `@halonicjs/schema-kit` (a thin layer over
Zod) and kept in `@halonicjs/format`, one folder per kind. The schemas are
exported as JSON Schema, with fields that have defaults marked optional, so
editors can check the files too.

Files are read and written through `@halonicjs/yaml` (a thin layer over the
`yaml` package). It adds a line and column to every node, so a validation error
points at a line. It supports the YAML our files use. Anchors, aliases, tags and
several documents in one file give a "not supported" error. It writes the same
text as the `yaml` package, so saving a file doesn't rewrite its neighbours or
fill git diffs with noise.

`@halonicjs/workspace` loads one workspace layout, driven by the registered file
kinds, and runs the checks that span several files.

## Consequences

- Version control, review and sync use git, not a Halonic feature.
- A change to a file format is a change to its schema, and the JSON Schema and
  the reference docs follow from it.
- Tests compare validation results by pass or fail, path and line, not by the
  wording of a library's error.

## Changed from an earlier decision

- The schemas used to live in one large file. Each file kind now has its own
  folder.
- The loader used to accept three workspace layouts. It now accepts one.
- Schemas and YAML go through two thin in-house packages instead of calling Zod
  and `yaml` from everywhere. That keeps the line-number errors and the "not
  supported" messages in one place.
