# format.hub-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a `hub.yaml`, the format shall accept the old `Hub` schema: `defaults` and `models` empty by default, hub-level aliases checked like `models.yaml` aliases, and `uses`, when present, with an empty list for each kind it leaves out.

## Examples

- Given only an id and a name, when it is parsed, then `defaults` and `models` are `{}` and `uses` is absent.
- Given `uses: { skills: [plain-words] }`, when it is parsed, then `connectors`, `knowledge` and `collections` are `[]`.
- Given `uses: { connectors: [Mailbox] }`, when it is parsed, then it fails with `invalid_format` at `uses.connectors[0]`.
