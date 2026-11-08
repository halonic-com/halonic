# format.parity-defaults

- Status: active
- Since: 0.1.0
- Source: HAL-381 review of HAL-113, the old schemas at 784f78d (`packages/core/schema/src/index.ts` and `collections.ts`)

When `parseFile` reads a fixture file the old loader read without a problem, the value it gives, defaults included, shall equal what the old Zod schema gives for the same data. The same holds for every copy of such a file with one key left out that the old schema still accepts. Skills are left out: their shape changed on purpose (format.skill-file).

## Examples

- Given the base `workspace.yaml`, when it is parsed, then its value equals the old schema's.
- Given the base `workspace.yaml` without `budget.currency`, when the kind's schema reads it, then `currency` is `EUR`, as in the old app.
