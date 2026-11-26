# library.connector-paste-token

- Status: active
- Since: unreleased
- Source: HAL-19445 (I7, split from HAL-19175); the button approved by the team on HAL-19173

Where Studio is given a store for connectors' secrets and the page isn't on a phone, the page of a local integration's connector whose file names workspace secrets (its own `secret` and the ones it picks for its sheet's secrets) shall show the **Secrets** section of `library.connector-secrets` for those names, once each and sorted. When that connector's line says the service didn't accept the token (`not-accepted` in `library.connector-trouble-line`), the line shall offer **Paste a new token**, and pressing it shall move focus to the entry of the first secret in that section. Without the section (no secret, no store, or a phone), and for any other trouble, the line shall show no **Paste a new token**.

## Examples

- Given the local integration Shop orders, which gets the secret shop-key, and whose last call got 401 from `shop.example.com`,
  when **Paste a new token** is pressed in the desktop app,
  then focus is on shop-key's entry in the Secrets section.
- Given the same connector with no secret,
  when its page opens,
  then the line says "shop.example.com didn't accept the token. It may be mistyped or revoked." with no button.
