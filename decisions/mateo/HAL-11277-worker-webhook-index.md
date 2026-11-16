# Decision: three yaml-free entry points so the Worker bundle holds no YAML parser

- Task: HAL-11277
- Approval: Liam approves the plan and its open point 5 on HAL-11277 (https://paperclip.halonic.com/HAL/issues/HAL-11277#comment-1639c2fc-9e95-48cf-86f5-9075340ce44a). A team decision with no board card (HAL-2282 rule).
- Kind: internal

The Worker bundled `yaml` because `snapshot-webhooks.ts` loaded the whole workspace at every
delivery, and because `@halonicjs/host-server` imported `@halonicjs/app` and `@halonicjs/format`
through their main entry points. `tooling/check/policy.json` gets three entries in `extraExports`,
the entry points that don't import `yaml`: `@halonicjs/format/routine`, `@halonicjs/format/connector`
and `@halonicjs/app/outside-run`. Each is tested to import no YAML code. No behaviour changes for the
CLI or Studio, which keep the main entry points.

## Why

`docs/guides/dependencies.md` says a cloud runtime carries only our code, the provider's code and
`zod`. The bundle check of HAL-11264 rightly failed the real Worker entry; with these entry points
it passes.

## Covers

- tooling/check/policy.json
