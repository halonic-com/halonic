# Decision: the folder store's watch leaves `node_modules` out

- Task: HAL-13334
- Approval: Liam approved the plan, including this requirement change, on HAL-13334 (https://paperclip.halonic.com/HAL/issues/HAL-13334), 19 November.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:svameaYwjuATi+zZ7g3/QejBNwPkhH/nj4lUj+jrPs9FCIjn4Ddp4fkzRsPPZND7X5d25+4a9woYFS0Jq6cOCw==

## What changes

`fs-node.watch-folder` gains one clause and one example: the folder definition store's watch
neither reads nor reports anything inside a `node_modules` folder, at any depth. Until now it read
every file the store lists when it opened, and reported every change it heard.

The rule itself lives in watch-kit, as the new opt-in `watch-kit.digest-watch-left-out`; the folder
store opts in with `names: ["node_modules"]`. `watch-kit.digest-watch` doesn't change, so the
browser and desktop stores' watches behave as before. No test is weakened or removed.

## Why

An agent's installed packages can hold tens of thousands of files and no definitions. Opening a
watch read every one of them, and a single file over about 512 MiB failed it. Studio's file tree
already hides `node_modules` (`files.tree.folders-closed-no-local-data`), so nobody sees the events
the watch no longer reports. `list()` and `version()` without options still give those files, so a
run's copy of the workspace is unchanged.

## A new skip on Windows

`packages/adapters/fs-node/src/definition-store-left-out.test.ts` is a new file. Two of its tests
lock a folder with `chmod` to prove the walk never steps into a left-out folder, and Windows ignores
those permission bits (HAL-4365). They skip on Windows only, with `[platform:win32]` in their names,
as the store's other `chmod` tests already do. They run on Linux and macOS, and the rest of the file
runs everywhere. No existing test is skipped.

## Covers

- fs-node.watch-folder
- packages/adapters/fs-node/src/definition-store-left-out.test.ts
