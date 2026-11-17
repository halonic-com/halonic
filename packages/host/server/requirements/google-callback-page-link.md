# server.google-callback-page-link

- Status: active
- Since: unreleased
- Source: HAL-10263 (follow-up of HAL-10258); builds on `server.google-sign-in`

The sign-in callback page shall end with a link only when the host's Google ports name one, with the link's address and text. A host that names none gets a page with no link. The link's address and text shall come from the host, never from the request, and the page shall write them as escaped text.

Rationale: the page used to link to `/`, which a host that serves no Studio page answers with a 401 or a 404, so the link led nowhere.

## Examples

- Given Google ports with no page link, when a sign-in comes back, then the page has no link.
- Given Google ports with a page link, when a sign-in comes back, then the page ends with that link.
