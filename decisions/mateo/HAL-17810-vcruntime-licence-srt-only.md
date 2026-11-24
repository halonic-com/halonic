# Decision: the Windows installer shows Microsoft's own licence for vcruntime140.dll, only with the sandbox

- Approval: HAL-17810, from the board's decision on HAL-12716 (24 Nov); Liam reviews and signs as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8lCII0FJRytb3b+qkZGq4zh27PD27n4Er3Tlw1eT8whHkTMUG6giDw8VflmRyfE4GviGRNczWK+lW0t7OmgSDg==

The board decided against an outside legal review of the installer's licence
page. Instead, the page shows Microsoft's own licence for `vcruntime140.dll`,
word for word, and only to a person who chooses srt as the sandbox on Windows.
Everyone else sees no licence page and gets no `vcruntime140.dll`.

## What changes

- `studio.installer-licence-page` is rewritten. The page no longer shows
  `windows/licence.txt`, the team's own wording (with its US $5 clause and its
  enforcement clause), which is deleted. It shows the `license.rtf` of the
  Visual C++ Redistributable we already pin, taken out of it unchanged by
  `fetch-vcruntime.ps1` and checked against a SHA-256 now pinned in
  `vcruntime.json` ("MICROSOFT SOFTWARE LICENSE TERMS, MICROSOFT VISUAL C++
  2015 - 2022 RUNTIME", EULA ID `Cpp_2015-2022_ENU.1033`). That text has a
  US $5 limit of its own: it is Microsoft's, so it stays as written.
- The page moves after the install page, and shows only while **Set up the
  agent sandbox** is ticked (there, or on the run-again page). The install
  page's button says **Next** while the box is ticked.
- `vcruntime140.dll.pinned` is no longer a Tauri resource that every install
  gets. The installer copies it only for the sandbox step: with pages after
  **I Agree**, silently with `/SANDBOX=1`, and over an install that already
  has it (so an update can set the sandbox up again). The uninstaller deletes it.
- In `.github/workflows/ci.yml`, the installer job walks the pages twice:
  with the box ticked (licence page with Microsoft's text, the DLL in the
  install folder and beside srt-win) and with it cleared (no licence page, no
  `vcruntime140` file). The silent install checks it has no such file, and the
  `/SANDBOX=1` install that it has one. No check is removed or weakened.

## Why

Board decision on HAL-12716. A silent `/SANDBOX=1` install can't show a page;
the person who passes `/SANDBOX=1` chooses srt, and the README says that it
installs the file without the page.

## Covers

- studio.installer-licence-page
- .github/
