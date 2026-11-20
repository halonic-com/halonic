# Decision: a heading that takes focus from code wears Studio's focus ring

- Task: HAL-13529
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13529 (team decision under the HAL-2282 rule, Sofia as designer, from the HAL-13469 check, PH1); Liam reviews the pull request on HAL-13529 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:h6of3lsL9PPtZu0riuGlerKkkV864tq/LdU4Zq4mh2cZWit92soM6FUMdtdXjtyM5JRa5jl5wZdYAqpjc1S+AQ==

## What changes

When Studio moved focus to a heading from code, what a keyboard user saw depended on the page:
Studio's ring (the test card and Inbox card titles), the browser's 1px outline (Inbox, Runs,
Changes, the run page, Library) or nothing (Home, Agents, Workflows, Routines and the provider's
API key heading, which carried `outline-none`). The kit's theme now rings every `h1` to `h6` with
`tabindex="-1"` on keyboard focus, in one rule, so new pages get it without a class. No focusable
heading carries `outline-none` any more, so the ring keeps its `Highlight` outline in forced
colours.

The new requirement `kit.focusable-heading` says this. `kit.empty-state` and `kit.side-panel`
said their focusable titles draw no ring; they now wear it, as every heading that takes focus from
code does. Their tests change from "has `outline-none`" to "wears the ring" or "keeps the
outline". No test was weakened or skipped.

## Why

A heading only code can focus isn't a control, which is why the kit's specs (23 A2) left the ring
off. But focus does land there, and a keyboard user who can't see where it went is lost (WCAG
2.4.7). The team chose one look everywhere: Studio's ring, as the card titles already had it.

## Covers

- kit.empty-state
- kit.side-panel
