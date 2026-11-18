# Decision: an unsigned sandbox helper leaves no copy of itself and no Installed apps entry

- Task: HAL-11253
- Approval: Liam approved this change on HAL-11253 (comment of 18 Nov): an unsigned build writes no helper copy to Program Files and registers no Installed apps entry.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AwK2wR5X5USVAonDOXUv4ip/+uyhhImeyafIF1OzxiS8CKD+c5IBIxRouIsPXrmv+ullMwe6EfAvvRvUexjfAg==

## What changes

- `studio.src-tauri.crates.sandbox-elevate.sandbox-elevate`: only a signed build lists "Halonic agent sandbox" in Installed apps. An unsigned build (dev, CI, and an unsigned release) leaves no copy of the helper in `Program Files\Halonic Sandbox` and no entry, and takes away a copy and an entry an earlier setup left. Two examples are added for it.
- On an unsigned build the sandbox is removed with the helper next to Halonic: Settings › Agent sandbox, `halonic sandbox remove`, or Halonic's uninstaller. Nothing else about setup or removal changes.
- The test `sandbox_elevate_skips_the_helper_check_only_in_an_unsigned_build` is replaced by three tests for the new behaviour, and the Windows CI job checks that an unsigned setup leaves no entry and no copy, and removes with the helper next to Halonic.

## Why

Installed apps runs the helper's copy with administrator rights, for every user of the computer. While the helper runs, its file in the user's app folder can be swapped for another program. A signed build checks the copy's publisher before it lists it; an unsigned build has no publisher to check against, and a hash of its own file can't be built into that same file. So an unsigned build lists nothing.

## Covers

- studio.src-tauri.crates.sandbox-elevate.sandbox-elevate
- apps/studio/src-tauri/crates/sandbox-elevate/tests/steps.rs
- .github/
