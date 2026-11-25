# cli.trust-check-assistant-added-hosts

- Status: active
- Since: unreleased
- Source: HAL-525 (the "added by the assistant" mark); HAL-18271 plan rev 2, section 2.4; HAL-18397. The same mark as the Studio's (`studio.trust-review-assistant-added-hosts`); the wording is HAL-525's, until the copy check

When `halonic trust` shows a local integration under Addresses (`cli.trust-check`), it shall list after the integration's settings each fixed host the Studio's assistant added to its sheet that the person didn't name, as the workspace's review folder in the profile records them (`app.review-assistant-added-hosts`), with "added by the assistant"; the sheet's other fixed hosts aren't listed. Each such host counts as an address in the summary. A changed integration shall list them under Changed even when only its code changed. A host the sheet no longer has isn't listed. The marks are read only from the profile, never from the workspace, and reading them writes nothing.

## Examples

- Given the local integration my-crm with the setting CRM_URL, whose sheet has `crm.example.com` and `api.example.com`, and the assistant added `api.example.com`,
  when its check is made,
  then Addresses shows "my-crm  CRM_URL  https://crm.example.com/" and under it "api.example.com  added by the assistant", and the summary lists 2 addresses.
- Given my-crm changed only in its code since it was trusted,
  when its check is made,
  then its Changed rows start with "api.example.com  added by the assistant".
