# studio.installer-parts-pinned

- Status: active
- Since: unreleased
- Source: HAL-20591, plan on HAL-20583 (board decision there: the WSL image and runtime become their own release assets); next to `studio.installer-wsl-runtime` and `studio.installer-wsl-image`

When the release workflow or the Studio preview workflow builds the Windows installer, it shall write a pin for the WSL runtime (`halonic-runtime.json`) and for the WSL image (`halonic-wsl.json`), each `{ "version", "sha256", "size", "url" }`, the runtime's also with `minRuntime` from `windows/min-runtime.json`, and stop unless each pin's SHA-256 and size are its archive's and its `url` is on the allow-list: `https`, port 443, no user name, `github.com` under `/halonic-com/halonic/releases/download/` or `/halonic-com/halonic-preview/releases/download/`, as `<tag>/<asset>`. The workflow shall add both parts to the release as `halonic-runtime-<version>.tar.gz` and `halonic-wsl-<image version>.tar.gz` (a character GitHub would rename becomes `-`), on every release, each only when its pin's `url` is exactly that asset on that release and the copy is the pinned file, list both in `SHA256SUMS`, and fail unless the release then holds each under its pinned name and size. When `windows/build-installer.ps1` is given `-PinParts` with `-Runtime` and `-Image`, it shall check each pin the same way and pack the two pin files and neither archive. Without `-PinParts`, `-Runtime` and `-Image` shall work as before.

## Examples

- Given a runtime archive and its `halonic-runtime.json`, the repository `halonic-com/halonic` and the tag `v0.1.2`,
  when the runtime is pinned,
  then the pin keeps its version, SHA-256 and size, gains `minRuntime`, and its `url` is `https://github.com/halonic-com/halonic/releases/download/v0.1.2/halonic-runtime-<version>.tar.gz`.
- Given a pin whose `url` is plain HTTP, on another port, with a user name, on another host, under another repository or outside a release's downloads,
  when it is checked,
  then the build stops and names the url.
- Given both pinned parts,
  when they are published into the release folder,
  then each is there under its versioned name and `SHA256SUMS` lists it with its pin's SHA-256.
- Given a pin whose SHA-256 isn't its archive's, or whose `url` names another release,
  when the parts are published,
  then it fails and adds nothing to `SHA256SUMS`.
- Given `windows/build-installer.ps1 -PinParts`,
  when it packs the installer,
  then it adds `tauri.pins.conf.json`, which installs `halonic-runtime.json` and `halonic-wsl.json`, and neither the runtime's nor the image's config.
