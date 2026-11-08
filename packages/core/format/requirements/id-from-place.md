# format.id-from-place

- Status: active
- Since: 0.1.0
- Source: HAL-113, ported from 784f78d `collect` in `packages/core/config/src/workspace.ts`

Where the caller gives the id of the file's place (its file name without the kind's suffix, or its folder), `parseFile` shall use it as the id when the file has none, keep the file's own id otherwise, and ignore it for kinds without an id of their own. For skills the folder is always the id.

## Examples

- Given a provider file without `id` and place id `spare`, when it is parsed, then its id is `spare`.
- Given `id: mock` and place id `spare`, when it is parsed, then its id is `mock`.
- Given place id `Spare`, when it is parsed, then it fails with `invalid_format` at `id`.
