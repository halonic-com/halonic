# library.connector-trouble-line

- Status: active
- Since: unreleased
- Source: HAL-19175 (I7 PR 4b, HAL-18391 plan section 2.4); wording approved by the team on HAL-19173; HAL-19445 (**Paste a new token**)

When a local integration's last call failed with a trouble (`app.connector-trouble`), its connector's status section shall show one plain line for it, as parts of text, with the host and each field name in code type. The lines shall be: for `reply-changed`, "`<Service>` answered differently than before (the `<field>` field is gone)."; for `not-accepted`, "`<Service>` didn't accept the token. It may be mistyped or revoked."; for `not-allowed`, "Your token isn't allowed to do this. Check its permissions at `<Service>`."; for `not-found`, "`<Service>` couldn't find what `<Name>` asked for. The service may have changed."; and for `slow-down`, "`<Service>` asked Halonic to slow down. Try again in a few minutes." `<Service>` shall be the host of the call, or the connector's name when there is none. For `reply-changed` and `not-found` the line shall offer **Let the assistant look** when a chat can open. It shall open a Build chat about the connector whose box holds the line, the integration's folder, the kind of trouble and the cleaned field names, and nothing the service sent. For `not-accepted` the line shall offer **Paste a new token** when the page has a **Secrets** section (`library.connector-secrets`); pressing it shall move focus to the entry of the first secret in that section. Without the section (no secret, no store, or a phone) the line shall show no button.

## Examples

- Given a connector whose last call got 429 from `shop.example.com`,
  when its page shows,
  then the line reads "shop.example.com asked Halonic to slow down. Try again in a few minutes." and has no button.
- Given a connector whose reply changed,
  when **Let the assistant look** is pressed,
  then a Build chat opens about the connector with `Integration: integrations/<folder>` and `Trouble: reply-changed` in its box.
- Given a local integration's connector that gets the secret shop-key, whose last call got 401 from `shop.example.com`,
  when **Paste a new token** is pressed in the desktop app,
  then focus is on shop-key's entry in the Secrets section.
