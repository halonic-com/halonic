# Decision: Models leaves the Settings feature's placeholder links

- Task: HAL-1292
- Approval: Liam approves the Models summary and the removal of the placeholder on HAL-10289 (https://paperclip.halonic.com/HAL/issues/HAL-10289): "PR 7 Settings Models summary: yes. ... Register it under the same id `models`, and remove the T11 placeholder in the same PR." A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

The requirement `settings.workspace-links` no longer lists Models: the Settings feature adds only the Trust link section. Models is added by the Models feature (`models.settings.settings-summary`) under the same id `models`, with one line ("3 aliases · 2 providers · budget €50.00 a month") and **Open Models**, so `settings.open('models')` keeps working. The Models examples and tests of the old requirement move to the new requirement. No test was weakened or skipped.

## Why

The placeholder was to go once the Models feature registered its own section, and adding the same id twice throws.

## Covers

- settings.workspace-links
