# Decision: Library › Plugins is view only on a phone and in a served browser

- Approval: board-approved plugin screens design, section 10, and microcopy 24 T17 (HAL-1739, HAL-1801); Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JCwrz/j6IhVMa8xKSBAOQU3jVEf+Yo1NsORe1PXl+DVK+flkR573/MNdHxMuZih6bJU87H8q2YsYS2ZqN3sPAA==
- Task: HAL-9383 (B27, view-only slice)

## What changes

`plugins.plugin-list` gains view-only: on a phone, and in a browser on `halonic serve`, the list has no **Add plugin** (also not in the empty state), the ⋮ of a plugin offers only Open and Open in new tab, and the list ends with the view-only line and a copyable `halonic plugin add <folder or git address>`. The app tells the list it is served with the new `place` prop (`"app"` or `"served"`, as the settings sections use) when it mounts the feature (HAL-9373). Nothing was removed on desktop.

## Why

The design says plugins are view only there, because adding, trusting and removing plugins changes what runs on the computer. Before this, the list offered those actions anyway.

## Decided by the team

- In a served browser the line starts "View only here." (as the workspace and sandbox pages do) rather than "on a phone", which would be wrong on a desktop browser.
- The plugin page, its ⋮ and the cards and commands are not part of this note; the page follows as its own slice.

## Covers

- plugins.plugin-list
