# Decision: list the bridge's Web-only entry point in `extraExports`

- Approval: HAL-13211 (the per-run bridge credential, shape agreed on HAL-13221); Liam approves and signs this note in review on HAL-17125
- Kind: internal

`@halonicjs/adapter-harness-bridge` gets a second public entry point, `./web`, next to its `src/index.ts`.

## What changes

- `packages/adapters/harness-bridge/package.json` exports `./web` (`src/web.ts`), which holds only the per-run bridge credential.
- `tooling/check/policy.json` lists that entry point under `extraExports`, so the one-entry-point rule allows it. Nothing else in the policy changes.

## Why

The Cloudflare Worker has no Node APIs. The package's main entry point pulls in Node code, so the Worker imports the credential from an entry point that uses only Web-standard APIs. A test keeps `src/web.ts` free of `node:` imports.

## Tests

`packages/adapters/harness-bridge/src/run-credential.test.ts` verifies `harness-bridge.run-credential`, the Node-import guard included.

## Covers

- tooling/check/policy.json
