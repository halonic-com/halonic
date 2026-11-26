# studio.trust-review-fix-additions

- Status: active
- Since: unreleased
- Source: HAL-511 proposal (the "New:" line); HAL-18391 plan rev 2, section 2.5; HAL-19171. The same lines as the CLI's (`cli.trust-check-fix-additions`); the wording is HAL-511's, until the copy check

When the Studio's workspace trust check (`studio.workspace-trust-review`) shows a local integration that changed since it was trusted, its row shall start with one line labelled "New:" for each host, secret and tool its trust content has now that it didn't have when it was trusted: "can also reach" and the host, or the setting that holds the address; "can also get the secret" and the secret's name; "can also offer the tool" and the tool's name. Hosts come first, then secrets, then tools. A host, secret or tool the integration no longer has shall get no line (HAL-65 decision 9).

## Examples

- Given the integration shop was trusted with `api.shopify.com` and the tools list-orders and list-products, and a fix added `cdn.shopify.com` and the tool create-order,
  when the trust check is shown,
  then shop's row starts with "New: can also reach cdn.shopify.com" and "New: can also offer the tool create-order".
- Given a fix only removed the tool list-products,
  when the trust check is shown,
  then shop's row has no "New:" line and doesn't name list-products.
