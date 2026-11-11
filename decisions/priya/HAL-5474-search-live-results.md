# Decision: the Search page's results follow the typing

- Approval: the team's decision on HAL-5474 (Sofia's design check, HAL-5455; small fix on an approved screen, HAL-2282), reviewed by the maintainer
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GiUTE2MpGbd9YSCoZjJ6iDnj8Z9wAEXjr0ASqWkSb9sb9zj65jycBxqZ0pBsE/MMzktNj4uIColEwzl0En7EBA==

The requirement gains a sentence; nothing it promised before is taken away, and no test was
weakened. The page from #1618 searched only the place's words, so typing in the box showed
nothing until Enter. The approved design (design search 3, T2 checklist 1.8) says the results
update as you type, after a short pause.

- The results now follow the box once the typing pauses for 300 ms, without a new place.
- Enter still commits the typed words as a new place in the tab, so the tab's title names them
  and Back brings the old words back.
- Leaving the tab with words not committed keeps the place's words.

One example is added.

## Covers

- shell.search-page
