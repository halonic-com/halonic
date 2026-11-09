# @halonicjs/app-studio

Owner: elena · Layer: apps · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Studio app: wires the Studio packages and features together. The Tauri shell and its Android project live in src-tauri; Vite comes later.

This package may change only through tasks that name it. It is an application, so nothing imports it;
its packages and features are listed in `package.json`.

## Commands

| Command                                              | What it does                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                        | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/app-studio` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
