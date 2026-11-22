# format.deployments-users

- Status: active
- Since: unreleased
- Source: HAL-13212 (selling layer design on HAL-12483, sections 1, 2 and 8, slice S1)

When `parseFile` reads a `deployments.yaml`, the format shall accept on each deployment an optional `users` block with `mode` (`owner` or `many`, `owner` by default), `meter` (`none`, `config` or `cloud`, `none` by default), an optional `config` block with a list of `limits`, and an optional `cloud` block with a required `product`, and shall refuse any other key in these blocks. Each limit shall have a `unit` (`runs`, `steps`, `tokens`, `cost` or `harnessMinutes`), an `amount` above zero, a `period` (`day`, `month`, `run` or `step`) and an optional `action` (`stop` or `notify`, `stop` by default). `product` shall be 1 to 64 letters, digits, `_` or `-`. When `meter` is `cloud` and there is no `cloud` block, the format shall fail with `users-cloud-product-missing` at `meter`. When two limits share a unit and a period, it shall fail with `users-limit-repeated` at the second one. When a `config` or `cloud` block is there but `meter` names another meter, it shall warn with `users-meter-settings-unused` at that block, without failing the file. A deployment without a `users` block shall read as before, with no `users` key.

Rationale: the block is how a deployed project turns the selling layer on (design, section 1). A limit has the shape of a plan's Limit in Halonic Cloud (design, section 2), so moving from `meter: config` to `meter: cloud` keeps the limits as written. The product id is not a secret; the deployment key never goes in the file. Two limits on the same unit and period would leave it unclear which one holds. Settings for another meter only warn, so switching meters changes only `meter:`, as with Cloudflare settings on another host. With no block nothing changes, so existing deployments keep today's behaviour.

## Examples

- Given a deployment without a `users` block, when it is parsed, then it has no `users` key.
- Given `users: {}`, when it is parsed, then it reads `{ mode: owner, meter: none }`.
- Given `mode: many`, `meter: config` and the limits `{ unit: cost, amount: 20, period: month }` and `{ unit: harnessMinutes, amount: 600, period: month, action: notify }`, when it is parsed, then they come back as written, the first with `action: stop`, and with no warnings.
- Given `meter: cloud` and `cloud: { product: prod_acme_code }`, when it is parsed, then it is accepted.
- Given `mode: everyone` or `meter: stripe`, when it is parsed, then it fails with `invalid_value` there; given `seats: 5`, it fails with `unrecognized_keys` at `users`.
- Given a limit with `unit: minutes`, `amount: 0` or `-1`, `period: week` or `action: warn`, when it is parsed, then it fails at that field of that limit.
- Given `product: prod acme`, a web address or 65 characters, when it is parsed, then it fails at `product` with a message that says which rule it breaks.
- Given `meter: cloud` with no `cloud` block, when it is parsed, then it fails with `users-cloud-product-missing` at `meter`: `Deployment "web" uses meter "cloud", so it needs users.cloud.product`.
- Given limits on cost per month, cost per day and again cost per month, when it is parsed, then it fails with `users-limit-repeated` at the third limit: `Deployment "web" already has a limit on cost per month`.
- Given `meter: none` with a `config` and a `cloud` block, when it is parsed, then it passes with two warnings `users-meter-settings-unused`, at `users.config` and at `users.cloud`.
