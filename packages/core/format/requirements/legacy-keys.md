# format.legacy-keys

- Status: active
- Since: 0.1.0
- Source: HAL-113, ported from 784f78d `upgradeLegacyKeys` in `packages/core/config/src/legacy.ts`

When a workflow test has `flow:` and no `workflow:`, or a routine's `run` has `flow:` or `project:` without the new name, `parseFile` shall read the old key as `workflow` or `hub`. Other kinds are left as they are: the old loader renamed `flow:` in every file, which only changed which unknown key it named.

## Examples

- Given `flow: invoice` in a workflow test, when it is parsed, then `workflow` is `invoice`.
- Given `run: { project: billing, flow: invoice }`, when the routine is parsed, then `run` is `{ hub: billing, workflow: invoice, input: {} }`.
- Given both `flow` and `workflow`, when it is parsed, then it fails with `unrecognized_keys` naming `flow`.
