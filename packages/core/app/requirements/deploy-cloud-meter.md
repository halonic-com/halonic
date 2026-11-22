# app.deploy-cloud-meter

- Status: active
- Since: unreleased
- Source: HAL-13212 (selling layer design on HAL-12483, sections 1 and 8, slice S1)

When the deploy service chooses a deployment whose `users.meter` is `cloud`, whether it was named or is the workspace's only Cloudflare deployment, it shall refuse it with `invalid_input`, say that this version of Halonic can't count usage with `meter: cloud` yet, and give the fix of using `meter: config` or `meter: none`. A deployment with `meter: none`, `meter: config` or no `users` block shall be chosen as before.

Rationale: the format accepts `meter: cloud` so a project can write its file ahead of Halonic Cloud (requirement `format.deployments-users`), but nothing reports usage to Cloud until slice S2. A deployment that went live without its meter would let every user run with no limit, so it stops before anything is uploaded.

## Examples

- Given a Cloudflare deployment `web` with `users: { mode: many, meter: cloud, cloud: { product: prod_acme_code } }`,
  when `halonic deploy web` runs, or `halonic deploy` with `web` the only Cloudflare deployment,
  then it fails with `invalid_input`, "web counts usage with meter: cloud, which this version of Halonic can't do yet." and the fix "Use meter: config or meter: none in deployments.yaml.".
- Given the same deployment with `meter: config` or `meter: none`,
  when it is chosen,
  then it is chosen as before.
