# Decision: the kit's requirements name the colours #1805 gave them

- Approval: Noah, the kit's owner and designer, decided this on [HAL-6060](/HAL/issues/HAL-6060)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:21niAKPEJaJSyEP2KT12OaT8SmkB5wbBxtM0EE9BJH58mTJX4W6vRXpiadLona/yT1X9N5/FyKTOGXGRi7C8BQ==
- Task: HAL-6060

## What changes

Two examples in the kit's requirements, and one test name, still called colours by the names they
had before #1805 (HAL-5581) moved the Studio onto the house style's spectrum:

- `kit.tabs`: the `warning` counter chip is described as "a violet "1" chip", not "an amber "1"
  chip". `warning` is now `#9736c5` in light and `#d380fe` in dark.
- `kit.agent-page-tokens`: the fifth orb (`--character-5b`) is "the violet orb", not "the orchid
  orb", as `theme-agent-pages.css` now calls it.

In `tabs.test.tsx`, "counts what needs a person in amber" becomes "counts what needs a person in
violet". Its assertions are unchanged.

## Why

#1805 kept every token's name and changed only its value, so the requirements' rules still hold
word for word. Only the colour names in their examples went stale: a reader checking the Studio
against them would look for an amber chip and an orchid orb that are no longer there.

No rule, test or assertion changes, so nothing is weakened. The "amber preset" in `kit.tab-hover`
stays: it names one of the four window frame presets, which #1805 didn't touch.

## Covers

- kit.tabs
- kit.agent-page-tokens
