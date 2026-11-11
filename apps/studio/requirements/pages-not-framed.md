# studio.pages-not-framed

- Status: active
- Since: 0.1.0
- Source: HAL-5218

The app's pages shall not be shown inside a frame of another page: the content security policy the shell gives them shall say `frame-ancestors 'none'`, on desktop and on Android.

## Examples

- Given the desktop app or the Android app,
  when its shell serves the Studio page or the connect page,
  then the content security policy says `frame-ancestors 'none'`.
