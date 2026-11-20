# Decision: a button's label wraps in a box too narrow for it

- Task: HAL-14010
- Approval: team decision under the HAL-2282 rule for a detail of the approved Button (Noah owns the kit's look); Liam reviews the pull request on HAL-14010 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bbwYjwWq1aN8Q+SqAV4SbLBnpmOU6zvO6/bd/GMnA3lu1kPotXWy3d20/utMGZM5EKO+EzBf4a3znl3pzZ+9DQ==

## What changes

A `sm`, `md` or `lg` Button with words is now never wider than the box it's in (`max-w-full`). When its label doesn't fit on one line, the label wraps between words, centred, and the button grows taller. On one line it looks and measures as before: 28px for `sm` at 1280px, 40px on a phone. With a `busyLabel`, both labels wrap in the one shared cell, so the button still keeps one size before, during and after.

An `xs` button stays on one line, so the 24px status bar keeps its height.

The `kit.button` requirement gains that clause and one example. No test was weakened or skipped; one test is added.

## Why

At 195 × 421 (400 % zoom of a 780px window) a plugin's page scrolled sideways (WCAG 1.4.10 Reflow): **Check for updates** in its 163px status box was 232px wide, because a button's label never wrapped and its busy cell keeps the width of "Checking for updates…". Fixing it in the kit fixes every button that sits alone in a narrow box, not just this one.

Measured on the Weather plugin's page at 195, 320, 390 and 1280px, light and dark: at 195px the status box's button now ends inside the box (52–167px, two lines); at 320, 390 and 1280px nothing changes.

## Covers

- kit.button
