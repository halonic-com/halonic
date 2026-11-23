# Decision: register the ./model-choice entry points of the app package

- Approval: Liam reviews this on HAL-16635 (security PR, plan on HAL-14808)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4AmhTaGy/MLqDCm6eqW37ng7JzuzcKhhoOKwxgLqgK43JpMjAr3cD0f238URBDLBwdaPBnk8649IHJavniuCCg==

`host-server` parses the `/api/model-choice/*` requests with `choiceKey` and `firstRunKeyProviders` from
`@halonicjs/app`. Importing them from the package root brings `yaml` into the Cloudflare Worker, which the
Worker bundle check refuses. So `@halonicjs/app` gets two entry points, `./model-choice` and
`./model-choice-service`, whose files have no value imports. This note registers both in `extraExports` of
`tooling/check/policy.json`, the same way as `./outside-run`; that is the only change to that file.

## Covers

- tooling/check/policy.json
