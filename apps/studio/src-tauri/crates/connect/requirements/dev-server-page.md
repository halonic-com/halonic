# studio.src-tauri.crates.connect.dev-server-page

- Status: draft
- Since: unreleased
- Source: HAL-19823

When a debug build of the shell runs with a `devUrl` that is a bare `http://` or `https://` origin, the navigation guard shall let the app's own page from that origin (same scheme, host and port, the same path, and no query or fragment the app's own page doesn't read) load in the window, as it does the bundled page. Where the shell is a release build, the navigation guard shall decide every navigation as if no `devUrl` were configured.

## Examples

- Given a debug build started by `pnpm tauri dev`, whose `devUrl` the Tauri CLI set to `http://127.0.0.1:1430`,
  when the window opens `http://127.0.0.1:1430/studio.html`,
  then the Studio loads in the window.
- Given the same debug build,
  when the window goes to `http://127.0.0.1:1430/` or `http://127.0.0.1:1431/studio.html`,
  then it opens in the browser.
- Given a release build whose config names a `devUrl`,
  when the window goes to that address,
  then it opens in the browser.

## Limits

- **Debug means debug assertions.** The shell reads the build from
  `cfg!(debug_assertions)`, which Cargo's dev profile turns on and its release
  profile turns off. `tauri build --debug` is a debug build, but it has no
  `devUrl` unless the config names one, so its guard is unchanged.
- **A `devUrl` with a path is ignored.** The guard compares origins, so a
  `devUrl` such as `http://localhost:5173/app/` gives no dev server and the
  page opens in the browser.
