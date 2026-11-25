# runtime.customer-limits

- Status: active
- Since: unreleased
- Source: HAL-14158 (selling layer S3-6); Cloud's `limits.customer` document (`control-plane.limits-documents`); the plan on HAL-14158 as approved, with its review notes

The Worker shall read Cloud's `limits.customer` document into the document the usage object of the customer's own scope (`u/<endUserId>`) keeps, which that object keeps only when its version is newer. It shall read:

- each amount from its decimal string itself, never through a floating-point number, as a whole number of the object's smallest step: cost in millionths of its currency, harness minutes in ms, runs, steps and tokens whole;
- the customer's status: `active` uses the plan; `suspended` or `deleted` refuses as stopped;
- the plan: `none` refuses as no plan, and its document stands until a newer one; `active`, `trialing` and `past_due` are used as sent, with no grace of the Worker's own, over the plan's period from `periodStart` to `periodEnd`;
- each limit's unit and amount, and whether a bigger plan raises it (`canUpgrade`);
- each override with its end (`until`), or none.

The Worker shall refuse the whole document, keeping nothing and leaving the kept version as it was, with a reason that names the rule and no value from the document, when: an amount isn't a decimal string, is negative, needs more decimals than its unit holds (zeros past them excepted), or is too large for a safe whole number; the customer's status, the plan's state, a unit, a period or an action isn't one it can keep (a limit per subscription period that stops, in this version); two limits name one unit; a cost amount has no three-letter currency, another amount has one, or two cost amounts name different currencies; a time isn't an ISO time; a plan `none` has limits; the document is for another customer; or the usage object's own checks refuse it. It shall never read such a document as having no limits. The document's `product` is information only and shall not be read, nor shall any field the format doesn't have.

Rationale: a rounded or clamped amount changes what a customer pays for; a value skipped instead of refused would leave a limit out, which reads as no limit; the product's state comes only from its numbered command, and product-wide limits only from their own document.

## Examples

- Given a monthly cost limit of "20.50" EUR,
  then the object keeps a cost limit of 20,500,000.
- Given a cost amount of "0.0000001", "-1", "1e3" or "9007199254.740992",
  then the document is refused.
- Given a document with a daily runs limit,
  then it is refused.
- Given a document whose customer is `suspended`,
  then the object keeps it as stopped.
- Given a document with the plan `none` and no limits,
  then the object keeps it with status `none`.
- Given a newer document that also carries a spending cap and the product `live`,
  then the object keeps only the customer's own limits.
