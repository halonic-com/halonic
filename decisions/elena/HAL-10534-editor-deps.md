# Decision: allow CodeMirror 6 in the new code editor package

- Task: HAL-10534
- Approval: the board approved option A (CodeMirror 6) on HAL-10536 (https://paperclip.halonic.com/HAL/issues/HAL-10536#comment-a7bb8957-fcbf-42be-93f3-26e5145695e2): "Option A, CodeMirror 6 ... one package `studio/code-editor`; core CodeMirror packages plus YAML and Markdown language support only; our own undo history; loaded only when a file is opened."
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PGCdggeLWT9ChcXLiuj0Mpg7wZ4fiGXqexQ7U27PXf5DtpJCdi2qBL4ksREVjTrTTBBjRQoaX+nhTMzelhz5CA==

## What changes

`tooling/check/dependencies.json` gains seven entries: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-yaml`, `@codemirror/lang-markdown` and `@lezer/highlight` (CodeMirror's own highlight-tag package, needed to colour code; it is part of the same project). Each is allowed only in `@halonicjs/studio-code-editor`, and the same versions are added to the catalog in `pnpm-workspace.yaml`. One existing rule is widened: `jsdom` may also be used in `@halonicjs/studio-code-editor`, because the editor's tests need a DOM (Liam approved this on HAL-10702). No test is changed.

## Why

Kit spec 24.7 names CodeMirror 6 for the Files code editor, and the board approved it on HAL-10536 under the conditions above. `@codemirror/commands` is used only for its default key bindings and indent commands; its history is never loaded, because the package has its own undo history. `@halonicjs/studio-code-editor` loads the library with a dynamic import, so it is fetched only when a file is first opened.

## Covers

- tooling/check/
