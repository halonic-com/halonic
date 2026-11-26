# @halonicjs/auto-approvals

Auto approvals in **shadow mode** (HAL-19462): the typed approval card, the workspace
never-list and the checks that may only block. Pure functions, no I/O, and nothing here
approves or denies.

For now it holds only the known values a never-list entry and an approval card may name
(`src/vocabulary.ts`). The card and the never-list reader follow in the next pull request.

Design: HAL-19416 (`design`, rev 2). Threat model: HAL-19417.
