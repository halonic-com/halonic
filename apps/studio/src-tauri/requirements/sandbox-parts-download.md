# studio.src-tauri.sandbox-parts-download

- Status: draft
- Since: unreleased
- Source: HAL-20583 (plan revision 3, design 3 and the Security section), HAL-20592

When the shell needs a sandbox part (the WSL image or the Linux runtime), it shall read the part's pin (`halonic-wsl.json` or `halonic-runtime.json`, `{ "version", "sha256", "size", "url" }`) from the app's folder each time, and use the part only when its size and SHA-256 equal the pin's. It shall look for the part beside the app first, then at `<profile>/parts/<name>-<sha256>.tar.gz`, and otherwise download it into `<profile>/parts/<name>-<sha256>.tmp`, renaming that file only once it matches the pin. A cached part or a `.tmp` that doesn't match shall be deleted. Only one download per part shall run at a time; a second one shall wait for the first and use its file. A download shall write at most the pinned size, and a download that breaks off shall resume with an HTTP `Range` request, always from the pin's URL, at most 3 times after the first attempt, each after twice the wait before it (2 seconds first). Every hop of the download shall be `https` on port 443 with no user name or password in the URL; the pin's URL shall be on `github.com` under `/halonic-com/halonic/releases/download/` or `/halonic-com/halonic-preview/releases/download/`, and a redirect shall go only to `release-assets.githubusercontent.com`, matched exactly, at most 3 times. Anything else shall be refused before a byte is read, the redirects in the same redirect policy as the update proxy rules, and no setting or variable shall widen this. A downloaded part shall be deleted once it is installed; a part beside the app shall stay.

## Examples

- Given a `halonic-runtime.tar.gz` beside the app that matches its pin,
  when the shell needs the runtime,
  then it uses that file and downloads nothing.
- Given a cached `halonic-runtime-<sha256>.tar.gz` one byte longer than the pin's size,
  when the shell needs the runtime,
  then the file is deleted and the runtime is downloaded again.
- Given a download whose bytes don't match the pin's SHA-256,
  when it ends,
  then the `.tmp` is deleted, nothing is renamed, and the part is refused.
- Given a download that breaks off after 5 bytes,
  when it is retried,
  then the request goes to the pin's URL with `Range: bytes=5-`.
- Given the pin's URL redirects to `raw.githubusercontent.com`,
  when the download follows it,
  then the hop is refused.
