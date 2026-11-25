# Decision: `@halonicjs/host-signed-request` gets a `./golden` entry point for its golden signature

- Approval: Liam reviews this on HAL-18226; the change is built in HAL-13552
- Kind: internal
- Task: HAL-13552

## What changes

`tooling/check/policy.json` lists `./golden` under `extraExports` for `@halonicjs/host-signed-request`,
and the package's `exports` gain `"./golden": "./src/golden.ts"`. That is the only change to that file.
Nothing existing is removed or weakened.

## Why

The golden request is one request signed with a fixed test key, time and nonce. The signer's tests,
the deployment's Cloud sender tests and Halonic Cloud's verifier (from its pinned commit) all test
against this one copy. A separate entry point keeps the test key out of the package root: production
code imports the root and never `./golden`.

## Covers

- tooling/check/policy.json
