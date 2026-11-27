# Decision: the basics steps look for the demo under its new folder name

- Approval: HAL-19048 (the task's "Done when" asks for the basics steps to pass on main's build), following the demo's rename in HAL-19402 (#6439)
- Kind: internal

Since #6439, Open demo names new demo folders `Acme demo`; it only reopens an older `Acme sample`. A fresh runner gets `Acme demo`, so the demo step looked for a name the app no longer makes. The requirement studio-click-test.basics-steps now names `Acme demo` as the folder the workspace menu lists under Recent. Nothing else it says changes, and its tests check the same things.

## Covers

- studio-click-test.basics-steps
