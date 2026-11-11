# Decision: CI's fresh-install check runs the `halonic` launcher with pnpm's Node 26

- Task: HAL-6414 (Julian's clean-machine run on HAL-6398 crashed with a raw `ERR_UNKNOWN_FILE_EXTENSION` on an old Node.js)
- Approval: the task asks for this change; Mateo reviewed it on [HAL-6427](/HAL/issues/HAL-6427), Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qq0snX8djdUrtt8EOJDKTNR7+4OXVTvfk4mAUoTGY4P9Pg9i8i3ZzXC8ON9USa/YmCUxamWVrbq1elsMaUxeBw==

## What changes

The `halonic` bin is now `apps/cli/bin/halonic.js`, a plain-JS launcher that refuses Node.js below 26.12 with a two-line message before it loads `src/main.ts`.

In `.github/workflows/ci.yml`, the step "CLI runs on a fresh install" now runs `pnpm exec node apps/cli/bin/halonic.js --help` instead of `node apps/cli/src/main.ts --help`.

## Why

The step should run the file users get, so a broken `bin` entry or import path fails CI. A bare `node` on the runner is Node 22, which the launcher now refuses on purpose; `pnpm exec` runs the Node 26 that `devEngines.runtime` pins, like every other pnpm step in the job.

No check is removed or weakened: the step runs the same CLI with the same flag, now through the real entry point.

## Covers

- .github/
