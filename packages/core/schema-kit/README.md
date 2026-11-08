# @halonicjs/schema-kit

Our thin layer over Zod: validation, TypeScript types derived from the schemas and JSON Schema export. Errors carry the path. The only package besides core/format that imports zod.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/schema-kit`

## Example

Parse good and bad input, list the problems with their paths and export a JSON Schema. The code
lives in [`examples/parse-and-export.ts`](examples/parse-and-export.ts), where it is typechecked and
run by `src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`,
because a package may not import itself by name; outside this package, import
`@halonicjs/schema-kit` as below.

```ts
import { formatPath, type Infer, parse, s, toJsonSchema } from "@halonicjs/schema-kit";

const Deployment = s
  .object({
    name: s.string().min(1),
    host: s.enum(["local", "cloudflare"]).default("local"),
  })
  .strict();
type Deployment = Infer<typeof Deployment>; // { name: string; host: "local" | "cloudflare" }

/** Parses good and bad input, lists the problems with their paths and exports a JSON Schema. */
export function runExample(): {
  value: Deployment | undefined;
  problems: string[];
  required: unknown;
} {
  // Defaults are filled in.
  const good = parse(Deployment, { name: "prod" });
  const value = good.ok ? good.value : undefined; // { name: "prod", host: "local" }

  // A bad input never throws: every problem comes back with its path.
  const problems: string[] = [];
  const parsed = parse(Deployment, { name: "", extra: true });
  if (!parsed.ok) {
    for (const issue of parsed.error) {
      problems.push(`${issue.code} ${formatPath(issue.path)}`.trim());
    }
  }

  // `host` is not required: it has a default.
  const required = toJsonSchema(Deployment)["required"]; // ["name"]
  return { value, problems, required };
}
```

## What it gives you

| Export                  | What it is                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s`                     | Zod's builders, limited to the ones the file format uses: `string`, `number`, `boolean`, `null`, `unknown`, `literal`, `enum`, `object`, `array`, `tuple`, `record`, `union`, `discriminatedUnion`, `intersection`, `lazy`. The schemas they build have Zod's methods (`.min()`, `.optional()`, `.default()`, `.strict()`, `.passthrough()`, `.extend()`, `.partial()`, `.superRefine()`, …). |
| `Schema<Output, Input>` | The type of any schema. Give a recursive schema this type: `const Guard: Schema<Guard> = s.lazy(() => …)`.                                                                                                                                                                                                                                                                                    |
| `Infer`, `InferInput`   | The type a schema produces, and the type it accepts (keys with defaults optional).                                                                                                                                                                                                                                                                                                            |
| `parse(schema, input)`  | Never throws for a bad input. Returns `ok(value)` with defaults filled in, or `err(issues)`.                                                                                                                                                                                                                                                                                                  |
| `Issue`                 | `{ code, path, message }`, plus `keys` for `unrecognized_keys`. `path` is the keys and indexes from the root, so the YAML layer can turn it into a line.                                                                                                                                                                                                                                      |
| `formatPath(path)`      | `cases[1].name`, for messages.                                                                                                                                                                                                                                                                                                                                                                |
| `toJsonSchema(schema)`  | A JSON Schema 2020-12 document of the **input**: keys with defaults are not required.                                                                                                                                                                                                                                                                                                         |
| `MAX_DEPTH`             | 256. Deeper input fails with one `too_deep` issue instead of overflowing the stack inside Zod.                                                                                                                                                                                                                                                                                                |

## Rules

- **Nothing else imports `zod`.** Only this package and `core/format` may (the check enforces it). Everything else uses `s` and `parse`.
- **Error codes are stable, messages are not.** The messages are Zod's for now; parity with the old app is on pass or fail and path.
- **Zod is pinned to 4.6.7**, the old repo's version, so files pass and fail exactly as before. An upgrade is its own pull request, and the old-schema tests must still pass.
- Need a builder that isn't on `s`? Add it here with a test, so the list stays the one place that says which parts of Zod we use.
