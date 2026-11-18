# Decision: the Studio budget banner says Change budget, not a workspace key

- Task: HAL-12069
- Approval: Liam approves this change on HAL-12069, for HAL-12069. Sofia decided the wording on HAL-12066 (small wording on an approved screen, HAL-2282 rule), so there is no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:m/fMci6uf3/Ixfi2dAOUxfJUcQr1hX16ibcg6tahBf7mkJNL29O/xRbdw2NdJlNrtQ+zB6X8OOaCxwq5NM0UBQ==

## What changes

Line 2 of the run page's budget banner no longer names a `workspace.yaml` key. Per run it reads
"Change the budget, then run again."; per month it reads "Change the budget, or wait until it
resets on 1 January (UTC)." A **Change budget** button opens Settings > Models where the page can
open Models. The command line keeps its key names and "1 Dec".

The requirement `runs.run-view.failure-banners` is updated to say this, and the banner tests now
expect the new lines. No test was weakened or skipped.

## Why

Studio's users change the budget in Settings > Models, not in a file. YAML keys stay in the docs
and the command line.

## Covers

- runs.run-view.failure-banners
