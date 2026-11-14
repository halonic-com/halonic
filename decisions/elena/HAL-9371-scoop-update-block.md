# Decision: the About section tells Scoop users the command to run

- Requirement: `settings.about-section` (`packages/studio/features/settings/requirements/about-section.md`)
- Task: HAL-9371 (design check A5, spec 20.6)
- Approval: Liam approves this note in review on the review task of HAL-9371
- Kind: user-visible

When Scoop manages updates, the About section now words an available update as "Halonic 0.1.1 is out. You have 0.1.0." and shows "Updates are managed by Scoop." with `scoop update halonic` and a Copy button. It still has no switch (spec 20.6). The requirement and its last example now say so. Nothing the requirement said before was removed, and no test was removed.

The words are the ones the approved spec 20.6 already gives; this brings the requirement and the page in line with it.

## Covers

- settings.about-section
