# runtime.limits-push-plan

- Status: active
- Since: unreleased
- Source: HAL-14151 (selling layer S2-25, the account menu); Cloud's `limits.customer` document (`control-plane.limits-documents`); the plan on HAL-14151 as approved

When a verified limits push (`runtime.limits-push`) carries Cloud's `plan` object with a `state` other than `none`, the Worker shall hand the scope's usage object the plan's `name` as the document's `planName`. It shall take the name only from `plan`: a `planName` in the pushed document itself shall be dropped, and so shall the `plan` object. A push without a plan, or with the plan `none`, shall keep no name, and be kept as before. The usage object checks the name (`cloudflare-durable.usage-summary`), so a name it refuses is a document that isn't valid.

Rationale: the account menu names the customer's plan, and only Cloud's signed plan may name it.

## Examples

- Given a signed push with the plan `{ "state": "active", "name": "Starter" }`,
  when it arrives,
  then the scope's object keeps `planName` "Starter" and no `plan`.
- Given a signed push with the plan `{ "state": "none" }` and a `planName` "Pro",
  then the object keeps no plan name.
- Given a signed push as it was sent before Cloud sent plans,
  then the object keeps it unchanged.
