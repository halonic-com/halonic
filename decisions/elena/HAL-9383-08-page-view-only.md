# Decision: A plugin's page is view only on a phone and in a served browser

- Approval: board-approved plugin screens design, section 10, and microcopy 24 T17 (HAL-1739, HAL-1801); Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:l81581yRSltqMO3qWk/kwC5KrYhWj9P4SFs4ycbFZ4XRcwdp52BAA1bgEu4uC7E+BcsI2gAA7nO9D/X+hEbfCA==
- Task: HAL-9383 (B27, last slice)

## What changes

`plugins.plugin-page` gains view-only: on a phone, and in a browser on `halonic serve`, the plugin's page has no Review (Trust), Update, Remove trust, **Remove plugin…**, **Check again** or **Open folder**. The ⋮ is there only when the plugin has a panel, and offers Open panel. The page ends with the same view-only line and copyable `halonic plugin add <folder or git address>` as the list. The app tells the page it is served with the `place` option (`"app"` or `"served"`) when it mounts the feature (HAL-9373). Nothing was removed on desktop.

## Why

The design says plugins are view only there, because trusting, updating and removing plugins changes what runs on the computer. Before this, the page offered those actions anyway. This finishes the list's view-only slice (#2874).

## Decided by the team

- Settings fields keep working as before: the design's view-only rule names adding, trusting and removing, not changing a plugin's settings.
- **Check again** and **Open folder** are hidden too: they act on the computer's folder, which a phone or a browser can't reach.

## Covers

- plugins.plugin-page
