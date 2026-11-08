# kit.external-link-web-only

- Status: active
- Since: 0.1.0
- Source: HAL-700

If an `ExternalLink`'s address isn't an absolute `http` or `https` address, then the kit shall throw a `TypeError` that names the address, so a `javascript:`, `file:` or `data:` address can never reach the system browser or Studio.

## Examples

- Given the address `javascript:alert(1)`, `file:///etc/hosts`, `data:text/html,hello`, `/settings` or `not an address`,
  when the link renders,
  then it throws "ExternalLink opens web pages only, with an http or https address. It got "…"."
- Given an `https` address, or `http://localhost:4173/`,
  when the link renders,
  then the address is on the link.
