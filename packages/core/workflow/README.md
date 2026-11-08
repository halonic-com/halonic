# @halonicjs/workflow

Workflow rules: the statecharts subset, guards, inputs, templates and validation.

- **Layer:** core
- **Owner:** mateo
- **Public API:** `@halonicjs/workflow`

Templates fill `{{path}}` placeholders from a scope (the context and the
current input). A value that is exactly one placeholder keeps its type, so a
number stays a number; placeholders inside a text are written as text.

`toNumber` reads amounts as people and models write them, in English
(`1,200.50`) or European (`1.200,50`) style, with or without a money symbol,
so number guards can compare them.

`parseDuration` reads the delay of a timer transition (`after: 30m`, `4h`,
`2d`) in milliseconds. The approval helpers decide what an `approve` or
`reject` event means for a tool call that waits for a person, and hold the
texts the agent reads when a call is rejected or needs changes.

Each behaviour has a requirement in [`requirements/`](requirements/).

## Example

```ts
import { parseDuration, render, renderText, toNumber } from "@halonicjs/workflow";

const scope = { input: { n: 3, name: "Ada" } };
render("{{input.n}}", scope); // 3
render("Hi {{input.name}}, {{input.n}}!", scope); // "Hi Ada, 3!"
renderText("{{input.n}}", scope); // "3"

toNumber("EUR 1.250,00"); // 1250
toNumber("n/a"); // null

parseDuration("30m"); // 1_800_000
```
