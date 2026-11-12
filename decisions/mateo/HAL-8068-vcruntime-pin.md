# Decision: the Windows sandbox-helper CI step ships and checks the pinned vcruntime140.dll

- Task: HAL-8068 (S-9 of HAL-7414)
- Approval: the task asks for this change; Liam reviewed the ci.yml part on HAL-8094 and signs this note as the CTO
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the step "Sandbox helper (set up, refuse a swapped srt-win, remove, leave a linked session folder)" gets two additions:

- Before it runs the helper, it runs `windows/fetch-vcruntime.ps1` and copies the result into the test app folder as `vcruntime140.dll.pinned`, the way the installer now ships it. The script downloads Microsoft's Visual C++ Redistributable from the URL in `windows/vcruntime.json`, stops unless its SHA-256 is the pinned one, takes `vcruntime140.dll` out of it and stops unless that file's SHA-256 is pinned too.
- After `setup`, it checks that the `vcruntime140.dll` beside srt-win in `Program Files\Halonic Sandbox\` has the pinned SHA-256. The app folder still holds the planted canary under the name `vcruntime140.dll`, so the check proves `setup` placed the pinned copy and not the planted one.

## Why

srt-win imports `vcruntime140.dll`, which a clean Windows 11 doesn't have. The helper now places a pinned copy beside it; the CI step has to give the helper that file, or `setup` stops with exit 32, and it should prove the file that lands in the admin-only folder is the pinned one.

No check is removed or weakened. The step gets one network download, pinned by SHA-256 at two levels, with no secret and no new permission. The installer job's list of files in the install folder doesn't name `vcruntime140.dll.pinned` yet; that is a follow-up and needs its own note.

## Covers

- .github/workflows/ci.yml
