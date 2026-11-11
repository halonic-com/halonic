# Decision: the Search page keeps the earlier rows while it searches

- Approval: the team's decision on HAL-5565 (Noah's visual check of #1771, HAL-5474; small fix on an approved screen, HAL-2282), reviewed by the maintainer
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3swYZ6ZCifs8stno7SzxeLV+0NIS6MxHNoMizbokoAOyS+aJc/Vm+guYWQOWCjKsCPUK0Gvb/7usryuNvMWkCA==

The requirement's "Searching…" sentence is made more exact; nothing it promised before is taken
away, and no test was weakened. Since the results follow the typing (HAL-5474), every pause
swapped the result list for skeleton rows for at least a frame, so the list flashed and jumped
while the user typed. The palette (Ctrl K) already keeps its rows while it searches.

- While the providers search, the page still says "Searching…", and keeps listing the rows found
  for the earlier words that the new words still match, with the list marked busy.
- Skeleton rows show only when there are no rows to keep: on the first search, after the box was
  cleared, or when the new words match none of the earlier rows.
- "Nothing matches" and "Couldn't search" are unchanged.

One example is added.

## Covers

- shell.search-page
