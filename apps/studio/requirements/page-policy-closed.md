# studio.page-policy-closed

- Status: active
- Since: unreleased
- Source: HAL-17799

The content security policy the desktop shell gives the app's pages shall say `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` and `frame-src 'none'`, as the Android one does.

## Examples

- Given the desktop app,
  when its shell serves the Studio page,
  then the content security policy says `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` and `frame-src 'none'`.
