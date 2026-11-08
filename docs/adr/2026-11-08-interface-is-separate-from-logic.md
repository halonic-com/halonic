# Interface is separate from logic

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

When behaviour is written inside screens, it can't be tested without a browser,
can't be used by the CLI or a server, and gets copied between screens.

## Decision

All behaviour lives in `@halonicjs/app` as commands and state, with no React.
The Studio's packages only render that state and call those commands.
`pnpm check` enforces the boundary: React, Tauri and Vite may be imported only in
`packages/studio/*`.

`@halonicjs/app` is a small kernel: a command bus, an event bus, a service
registry, undo and a scheduler. Each Studio feature is its own package and brings
its own state and commands. Features reach each other only through their public
`api`, and only `studio/services` may use an adapter.

Undo and unsaved changes stay workspace-wide in the kernel, because the raw file
editor and the structured editors share one file model.

## Consequences

- Any behaviour can be tested, and used by the CLI, without a screen.
- Routine timing and chat run in headless services, so they don't depend on
  which features the Studio loads.
- Calls to a server are typed commands. Studio features don't call `fetch`.

## Changed from an earlier decision

The old design held all behaviour in one `Studio` class of about 2,800 lines.
The new kernel is small, and each feature brings its own part.
