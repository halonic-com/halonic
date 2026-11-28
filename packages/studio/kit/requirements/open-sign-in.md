# kit.open-sign-in

- Status: active
- Since: unreleased
- Source: HAL-20515, HAL-20663 (the origin); the board's request on HAL-10 (sign-in links open in a small browser window on top of the Halonic window)

Where a feature opens a page on which the person signs in, it shall open it with the kit's `useOpenSignIn()`, with the origin of the service it signs in to, and the kit shall open it with the `openSignIn` the shell gives `OpenExternalProvider`, or with that provider's `openExternal`, without the origin, where the shell gives none. Every other page shall keep opening with `openExternal` (`kit.external-link`).

## Examples

- Given an `OpenExternalProvider` with both `openExternal` and `openSignIn`,
  when a feature opens a Paperclip approval page with `useOpenSignIn()` and a task page with `useOpenExternal()`,
  with the origin `https://paperclip.acme.test`,
  then `openSignIn` gets the approval page with that origin and `openExternal` gets the task page.
- Given an `OpenExternalProvider` with `openExternal` only,
  when a feature opens a Paperclip approval page with `useOpenSignIn()`,
  then `openExternal` gets it.
