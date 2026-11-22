# studio.connect.bundle

- Status: active
- Since: unreleased
- Source: HAL-15159 (D7 design, section 4); HAL-15178

The connect page's build shall fail when the page takes in any of the desktop Studio: the Studio shell, the engine, an adapter, the code editor (with CodeMirror and Lezer), or a Studio feature other than the phone pages of `studio-feature-remote/phone`. It shall also fail when the built page is over 800 KB on disk, or when its `<meta>` policy isn't the one in `studio.connect.no-network`. The check reads what the build wrote, so every build of the page, the Android app's included, checks the files the app ships.

## Examples

- Given the connect page as it is built today,
  when it is built,
  then the build passes.
- Given a page that takes in modules of the Studio shell and of an adapter,
  then the build names both, with how many modules and the first of each.
- Given a page that takes in `studio-feature-remote/src/phone/`,
  then the check passes; given one that takes in `studio-feature-remote/src/settings/`, it fails.
- Given a built page of 800,001 bytes,
  then the build fails and says Liam approves a higher limit.
