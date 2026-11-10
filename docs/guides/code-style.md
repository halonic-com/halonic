# Code style

How we write code in Halonic. Read it before you write or review code. The short
version is in `AGENTS.md`. Linting and formatting catch part of it
(`pnpm verify` runs them); reviewers check the rest.

## Readable code over short code

Code is read many more times than it is written, often by someone who doesn't
know this part of the repo. Write for that reader.

### Names

Use clear, full names.

```ts
// Good
const pendingApprovals = runs.filter(isWaitingForApproval);

// Bad
const pa = runs.filter(w);
```

### Control flow

- Write explicit steps. Check the unusual case first and return early, so the
  main path isn't nested.
- No nested ternaries. Biome fails them. It also fails a function whose
  cognitive complexity is over 15.
- Don't build a long `.map().filter().reduce()` chain when a loop reads better.

```ts
// Good
function findDueTimer(timers: readonly Timer[], now: number): Timer | undefined {
  let earliest: Timer | undefined;
  for (const timer of timers) {
    if (timer.dueAt > now) {
      continue;
    }
    if (earliest === undefined || timer.dueAt < earliest.dueAt) {
      earliest = timer;
    }
  }
  return earliest;
}
```

### Files and exports

- One concept per file. Keep files under 300 lines. The check fails at 500, and
  warns when a function is longer than 60 lines.
- Named exports only. Don't use default exports, so search finds things. The
  exception is a tool's config file (`vite.config.ts`, `astro.config.mjs`, a
  Vitest config), which has to use `export default`.
- Each package has one `src/index.ts` that names its public API. Don't use
  `export *`. Code inside the package imports by relative path.
- Relative imports carry the `.ts` extension, so Node can run our TypeScript
  directly: `import { run } from "./run.ts"`.
- Use `import type` and `export type` for types, and the `node:` prefix for
  Node's built-in modules.

### Types and errors

- No `any`. Use `unknown` and narrow it.
- No `@ts-ignore`.
- No non-null assertion (`!`) without a comment that says why the value can't be
  missing. Biome fails every one it finds, so a justified one needs a
  `biome-ignore` with the same reason.
- Never swallow an error. Return a typed result, or throw an error with a message
  that says what went wrong and, where you can, how to fix it. An empty `catch`
  is a bug.
- A message a person may see, such as a core error shown under a field in Studio, is
  a full sentence in sentence case that ends with a full stop and holds no internal
  codes. Say which field it is about when it is not obvious, for example
  `Minute: "60" is outside 0-59.` Write the check and its message together.
- The TypeScript settings are strict, and they are shared in `tooling/config`.
  They include `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
  and `verbatimModuleSyntax`. Don't loosen them in a package.

### Comments

Comments explain _why_, not _what_. If a comment says what the next line does,
rename something so the code says it. Write a comment where the reason isn't
visible: a rule from a spec, a bug you are working around, a choice between two
reasonable ways.

```ts
// Good: says why
// Events are checked in file order, because the first match wins.
for (const transition of state.transitions) { … }

// Bad: says what
// Loop over the transitions.
for (const transition of state.transitions) { … }
```

## Abstraction where it helps

- Shared logic lives once, behind an interface in the right layer: a port, a
  service or a helper in `@halonicjs/std`. Don't copy it. If you find a large
  block copied between files, move it.
- Don't add an interface that has one implementation and no reason to exist.
- Wait for the third use before you generalise ("rule of three"). Two similar
  pieces of code are often similar by accident.
- Keep outside-world code in adapters and behind a port. See
  [dependencies](dependencies.md) and the [layer rules](checks.md).

## Thin commands and screens

A CLI command (`apps/cli`) and a Studio screen do three things, in this order:

1. **Parse** the input: arguments and flags, or what the user typed and clicked.
2. **Call one app service**: a function or service from a core package or from
   `@halonicjs/app` that does the work and returns its result as data.
3. **Format** the result: printed text and an exit code, or what the screen shows.

Everything else, such as validation rules, decisions, loops over runs or
files, and reading or writing the workspace, belongs in the service, behind its
interface. That way the CLI and the Studio do the same thing in the same way,
and the logic is tested once, without a terminal or a browser.

```ts
// Good: parse, call one service, format
export async function runValidate(args: ValidateArgs, out: Writer): Promise<ExitCode> {
  const report = await validateWorkspace(args.directory);
  out.write(formatReport(report));
  return report.errors.length === 0 ? 0 : 1;
}

// Bad: the command decides what counts as an error
export async function runValidate(args: ValidateArgs, out: Writer): Promise<ExitCode> {
  const workspace = await loadWorkspace(args.directory);
  for (const workflow of workspace.workflows) {
    if (workflow.states.length === 0) {
      out.write(`${workflow.name}: no states\n`);
    }
  }
  …
}
```

Connecting services to their adapters (file stores, the clock, model providers)
happens once, where the app starts, and the command or screen receives the
services ready to use. A command doesn't build its own stores.

When no service does what a command or screen needs, add or extend the service
first, then call it. If you need two services, that is usually a sign one service
is missing: the work that combines them goes into a new one. Reviewers check
every new command and screen against this rule.

## Documentation

- **Every exported function, type and class has a doc comment.** No check
  enforces this yet, so reviewers do. Say what it
  does, then what its parameters mean, what errors it can give and, where it
  helps, a short example.

  ```ts
  /**
   * Finds the earliest timer that is due and whose guard passes.
   *
   * @param timers - the timers started by the current `wait` state.
   * @param now - the engine clock's current time, in milliseconds.
   * @returns the timer to fire, or `undefined` when none is due.
   */
  export function findDueTimer(timers: readonly Timer[], now: number): Timer | undefined {
    …
  }
  ```

- **Every package has a `README.md`** with its purpose, layer, owner, public API
  and one runnable example. `pnpm new package` writes a starter README; the
  `readme-examples` check holds the example's imports to the package's exports.
- **Decisions are recorded** in [`docs/adr/`](../adr/README.md), one file each.
  Write one when you change how the repo is built: a layer rule, a port, a
  dependency of the core.
- **Docs change in the same pull request as the behaviour.** The pull request
  template asks for it, and the reviewer checks it.
- **Changeset texts are for users.** Write one sentence a user would understand.
- Follow [writing docs](writing-docs.md) for the text itself.

## Formatting

Biome formats TypeScript, CSS and JSON, and CI checks it, so a diff never holds
whitespace changes. You don't need to remember the rules. Run `pnpm format`
and commit the result.

The settings, for reference: 2 spaces, lines up to 100 characters, double quotes,
semicolons and trailing commas. Don't change formatting by hand to match your
taste, and don't mix formatting changes into a change that does something else.
