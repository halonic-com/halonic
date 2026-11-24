# @halonicjs/openui-lang

Reads the display part of [OpenUI Lang](https://github.com/thesysdev/openui/blob/main/spec/language.md)
1.1 into a component tree checked against a component list, whole or as a reply streams in.

- **Layer:** core
- **Owner:** owen
- **Public API:** `@halonicjs/openui-lang`

## What it reads

Components, references, strings, numbers, `true`, `false`, `null`, lists and objects, plus two
actions: `@ToAssistant(message, context?)` and `@OpenUrl(url)`, alone or in `Action([...])`.
A reply that uses `Query`, `Mutation`, a `$state` variable, an expression (operators, `? :`,
`.field`, `[index]`), `@Run`, `@Set`, `@Reset` or any other `@` function gives
`{ kind: "not-supported", feature }` and no tree at all. Edits merge with `mergeOpenUiEdit`.

A reply over a limit in `src/limits.ts` gives `too-large` or `too-deep`.

## Example

```ts
import { OpenUiStream, readOpenUi } from "@halonicjs/openui-lang";

const result = readOpenUi('root = Stack([Text("Hi")])', library);
// { kind: "tree", root: { type: "Stack", props: { children: [...] } }, errors: [], ... }

const stream = new OpenUiStream(library);
stream.push('root = Stack([Te'); // a tree that can be drawn already
stream.end(); // the same result as readOpenUi on the full text
```

## Conformance

`fixtures/spec-1.1/` is a copy of the spec's conformance fixtures, the case folders and `library.json` (`spec/fixtures/1.0/` in
`thesysdev/openui` at commit `bb01b38fc432e95e16d8074c7f2ec74933ca63e4`, spec version 1.1), under
the MIT licence (see `NOTICE`). `src/conformance.test.ts` runs all 58 program cases. The validation
rules case belongs to the form component.
