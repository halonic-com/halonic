# kit.external-link-web-only

- Status: active
- Since: 0.1.0
- Source: HAL-700; HAL-12345 (one rule for the Markdown reader and the link)

If an `ExternalLink`'s address isn't an absolute `http` or `https` address, then the kit shall throw a `TypeError` that names the address, so a `javascript:`, `file:` or `data:` address can never reach the system browser or Studio, and the kit shall export the same rule as `isWebAddress`, so code that decides whether to draw a link never draws one that throws.

## Examples

- Given the address `javascript:alert(1)`, `file:///etc/hosts`, `data:text/html,hello`, `/settings` or `not an address`,
  when the link renders,
  then it throws "ExternalLink opens web pages only, with an http or https address. It got "…".", and `isWebAddress` is false for it.
- Given an `https` address, or `http://localhost:4173/`,
  when the link renders,
  then the address is on the link, and `isWebAddress` is true for it.
