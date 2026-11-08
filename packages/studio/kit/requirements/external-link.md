# kit.external-link

- Status: active
- Since: 0.1.0
- Source: HAL-700; Google setup flow design, section 3.1; desktop wiring in HAL-192

An `ExternalLink` shall show its text, which says where it goes, followed by ↗, and screen readers shall also hear "(opens in your browser)". When the user clicks it with the left or middle button, the kit shall cancel the link's own navigation and call the `openExternal` service with its address. The shell provides `openExternal` through `OpenExternalProvider`; where it provides none, the kit shall open the address in a new browser tab with `noopener` and `noreferrer`. A right click shall stay with the browser.

## Examples

- Given an `ExternalLink` to the Audience page with the text "Audience page",
  when it renders,
  then it reads "Audience page ↗ (opens in your browser)", the ↗ is hidden from screen readers, and the address is on the link.
- Given the shell provides an `openExternal` service,
  when the user clicks the link or middle-clicks it,
  then the service gets the address once and Studio doesn't navigate.
- Given no `OpenExternalProvider`,
  when the user clicks the link,
  then `window.open` gets the address, `_blank` and `noopener,noreferrer`.
- Given the user right-clicks the link,
  then `openExternal` isn't called and the browser shows its menu.
