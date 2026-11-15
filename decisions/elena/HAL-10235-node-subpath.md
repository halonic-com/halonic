# Decision: register the ./node entry points of the scheduler and coordination adapters

- Approval: Liam reviews this on HAL-10239; the change is built in HAL-10235
- Kind: internal

`@halonicjs/adapter-scheduler-node` and `@halonicjs/adapter-coordination-node` move their Node-only helpers
(`systemSetTimer`, `randomLeaseToken`) to a `./node` subpath, so the package roots have no `node:` imports and a
window can load them. This note registers both subpaths in `extraExports` of `tooling/check/policy.json`,
which is the only change to that file.

## Covers

- tooling/check/policy.json
