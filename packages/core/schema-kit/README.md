# @halonicjs/schema-kit

Validation with TypeScript types derived from the schemas and JSON Schema export; replaces Zod. Errors carry the path (plan 7.3).

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/schema-kit`
  - `s`: the builders (`s.object`, `s.string`, `s.union`, …)
  - `Infer<typeof schema>` and `InferInput<typeof schema>`: the parsed and accepted types
  - `schema.parse(input)` (throws `SchemaError`) and `schema.safeParse(input)` (returns a result)
  - `toJsonSchema(schema)`: a JSON Schema 2020-12 document of the input

## Example

From [`examples/deployments.ts`](examples/deployments.ts), which is typechecked and tested:

```ts
import { type Infer, type Issue, s, toJsonSchema } from "@halonicjs/schema-kit";

// deployments.yaml: at least one deployment, each with a host and a stage.
export const Deployments = s
  .object({
    version: s.literal(1).default(1),
    default: s.string().optional(),
    deployments: s
      .record(
        s.string().regex(/^[a-z0-9][a-z0-9-_]*$/, "use lowercase letters, digits, '-' or '_'"),
        s
          .object({
            name: s.string().min(1),
            host: s.enum(["local", "cloudflare"]).default("local"),
            stage: s.enum(["development", "production"]).default("development"),
          })
          .strict(),
      )
      .refine((deployments) => Object.keys(deployments).length > 0, "Name at least one deployment"),
  })
  .strict();

export type Deployments = Infer<typeof Deployments>;

/** Reads parsed YAML: the typed value, or each problem with the path the YAML layer turns into a line. */
export function readDeployments(input: unknown): Deployments | readonly Issue[] {
  const result = Deployments.safeParse(input);
  return result.ok ? result.value : result.error;
}

/** The JSON Schema editors use for deployments.yaml. */
export const deploymentsJsonSchema = toJsonSchema(Deployments);
```

`readDeployments({ deployments: {} })` returns
`[{ code: "custom", path: ["deployments"], message: "Name at least one deployment" }]`.

## What it covers

Everything the old Zod schemas used: `string` (`min`, `max`, `regex`, `email`,
`url`), `number` (`min`, `max`, `positive`, `int`), `boolean`, `null`,
`unknown`, `literal`, `enum`, `object` (`strict`, `passthrough`, `extend`,
`partial`), `array` (`min`, `max`), `tuple`, `record`, `union`,
`discriminatedUnion`, `intersection`, `lazy` for recursive schemas, and on
every schema `optional`, `default`, `refine` and `refineWith`.

Each behaviour is a requirement in [`requirements/`](requirements/).

## Parity with Zod

Pass or fail and the issue paths match Zod 4.6.7, the version the old repo
used (D7); the messages are our own. A differential test suite checks this on
every old file schema, on random schemas built from every combinator and on
generated URLs, with `zod` and `fast-check` as dev-only oracles. JSON Schema
output equals what the old repo's `toJsonSchemas()` wrote.

Known differences, each covered by a requirement:

- **Deep nesting** (`schema-kit.nesting-limit`): a recursive schema stops at
  256 levels with a `too_deep` issue. Zod overflowed the stack.
- **`__proto__` keys** (`schema-kit.prototype-keys`): never change a parsed
  value's prototype.
- **URLs** (`schema-kit.string-url`): hosts with non-ASCII letters are
  accepted without the IDNA checks a browser makes. The core may not use the
  platform's `URL` class (plan 4.1).
- **Intersections**: two parsed values that disagree give an
  `intersection_conflict` issue; Zod threw an error. Strict objects inside an
  intersection each judge unknown keys on their own.
- **Types**: a key whose schema is a union with an optional option may be
  left out at run time, as in Zod, but the derived type still lists it as
  required.
