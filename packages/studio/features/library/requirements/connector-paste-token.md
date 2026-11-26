# library.connector-paste-token

- Status: active
- Since: unreleased
- Source: HAL-19445 (I7, split from HAL-19175); the button approved by the team on HAL-19173

Where Studio is given a store for connectors' secrets and the page isn't on a phone, the page of a local integration's connector whose file picks workspace secrets for its sheet's secrets shall show the **Secrets** section of `library.connector-secrets` for those names, once each and sorted, and for no other: not the connector's own `secret`, which the runner doesn't give a local integration. Under each name the section shall show the line "Kept in your system keychain, never in files. <connector> sends it only to the sites it says it connects to. Studio uses this one; halonic secret set keeps a separate one for the command line.", in place of the sentence about the program a connector starts, because a local integration starts no program. When that connector's line says the service didn't accept the token (`not-accepted` in `library.connector-trouble-line`), the line shall offer **Paste a new token**, and pressing it shall move focus to the entry of the first secret in that section, once per press: when the section's entries are drawn again later (its secret names change, or the file can't be read for a moment), focus shall stay where it is. Without the section (no secret, no store, or a phone), and for any other trouble, the line shall show no **Paste a new token**.

## Examples

- Given the local integration Shop orders, which gets the secret shop-key, and whose last call got 401 from `shop.example.com`,
  when **Paste a new token** is pressed in the desktop app,
  then focus is on shop-key's entry in the Secrets section, under the line "Kept in your system keychain, never in files. Shop orders sends it only to the sites it says it connects to. Studio uses this one; halonic secret set keeps a separate one for the command line."
- Given the same connector with no secret,
  when its page opens,
  then the line says "shop.example.com didn't accept the token. It may be mistyped or revoked." with no button.
