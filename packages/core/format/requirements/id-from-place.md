# format.id-from-place

- Status: active
- Since: 0.1.0
- Source: HAL-113, ported from 784f78d `collect` in `packages/core/config/src/workspace.ts`; an own id that differs from its place's, from Nina's check C337 (HAL-14257, row 21, code row C20) and C340 (HAL-14271, row 8), in HAL-14277

Where the caller gives the id of the file's place (its file name without the kind's suffix, or its folder), `parseFile` shall use it as the id when the file has none, and ignore it for kinds without an id of their own. When the file's own `id` differs from it, the file shall fail with the error `id-differs-from-place` at `id`: `The id is <id>, but the file is <file name>. Use the same name in both, or leave id out.`, or for a hub's own file `The id is <id>, but the folder is hubs/<hub>/. Use the same name, or leave id out.` (parity difference `id-differs-from-place`). A file without an `id` gets no message. For skills the folder is always the id. When an id from the place fails, the problem's message shall say that the id comes from the file name.

## Examples

- Given a provider file without `id` and place id `spare`, when it is parsed, then its id is `spare`.
- Given `id: mock` and place id `mock`, when it is parsed, then its id is `mock`.
- Given `writer.agent.yaml` with `id: author`, when it is parsed, then it fails with `id-differs-from-place` at `id`, and the message is `The id is author, but the file is writer.agent.yaml. Use the same name in both, or leave id out.`.
- Given `hubs/notes/hub.yaml` with `id: note`, when it is parsed, then the message is `The id is note, but the folder is hubs/notes/. Use the same name, or leave id out.`.
- Given place id `Spare`, when it is parsed, then it fails with `invalid_format` at `id`, and the message says the id `Spare` comes from the file name.
