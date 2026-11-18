# sign-in-loopback.system-browser-opener

- Status: active
- Since: unreleased
- Source: HAL-11618 (HAL-8613, HAL-984 design, section 4)

The system browser opener shall open an `http` or `https` address with the system's own opener (`/usr/bin/open` on macOS, `rundll32.exe` under `%SystemRoot%\System32` on Windows, `xdg-open` elsewhere), started by full path where the platform allows, so a program in the current folder can't take its place, as one program with the address as its argument and never through a shell. It shall refuse any other address, such as a `file:` address, a bare path, a UNC path or a path under a skill's `scripts/` folder, before anything starts, and give `false` when the browser could not be opened.

## Examples

- Given `https://accounts.example.test/auth?state=abc` on Linux, then `xdg-open` is started with that address and the answer is `true`.
- Given a `file:` address, a bare path, a UNC path or a script path, then nothing is started and the answer is `false`.
- Given Windows without a usable `SystemRoot`, then nothing is started and the answer is `false`.
- Given a system without an opener, then the answer is `false`.
