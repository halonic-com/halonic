# Decision: the Studio feature packages run their test files without per-file isolation

- Task: HAL-15904
- Approval: the board approved the switch on HAL-15904 (22 Nov); Liam approves this note in review on HAL-15904
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:r0Q9shGrqJgznmYqS7x5yUropvbBp7tAVogE8UxsypuEYomoFZYFdqmC7HtDv/VjFYcj5ZxKJCYFTXKn6dapAQ==

## What changes

Every package under `packages/studio/features/` sets `test.isolate: false` in its `vitest.config.ts`,
so the test files in one worker share their modules and their jsdom document. The benchmark on
HAL-15904 measured about half the time for `@halonicjs/studio-feature-workflows`, because most of a
file's time went to setting up the environment and imports again.

Sharing showed tests that leaned on a fresh worker per file. They are fixed, not opted out:

- `files`: the eight file-tab tests each mocked `@halonicjs/studio-code-editor` with their own
  state, and the first file's mock won. They now share one stand-in, `src/test-support/code-editor.ts`.
  Tests that delete a file clear the trash list after each test (`forgetAllTrashed`).
- `library`: the collection-page tests faked the popover and the modal once on import, so the next
  file's restore took them away. They now fake them before each test. `files/api`'s
  `requestFilesReveal` is mocked once for the whole package, in a setup file
  (`src/test-support/mock-files-api.spec.ts`), because several test files load the real module
  first. The five docs-folder tests move unchanged from `library-place.test.tsx` into
  `library-docs-folder.test.tsx`, which keeps `library-place.test.tsx` 20 lines under the
  file-size limit.
- `models`: an alias-tab test showed two tabs and unmounted only one, so the next file found its
  fields.

No test, assertion or requirement is removed: the five moved tests run in their new file under
the same requirement, `library.open-docs-folder`.

## Covers

- packages/studio/features/library/src/ui/library-place.test.tsx
