# One interface codebase

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Halonic's Studio has to run on Windows, on Android and in a browser. Three
codebases would triple the work and drift apart.

## Decision

The Studio is one React codebase, built with Vite. Tauri v2 wraps it for Windows
and Android, and the same code runs in the browser. The platform differences sit
in adapters, for example the file system adapters for the browser and for Tauri.

React, Tauri and Vite are used only in `packages/studio/*` and `apps/studio`.

## Consequences

- A feature is written once and works on every platform the Studio supports.
- A feature that needs something only one platform has asks for it through a port.
- iOS, macOS and Linux installers are not released. The code stays portable.

## Changed from an earlier decision

The old record named iOS as a later target. The new repository lists Windows,
Android and the browser, and leaves other platforms out until there is a decision
to add them.
