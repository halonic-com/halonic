# studio.trust-review-assistant-added-hosts

- Status: active
- Since: unreleased
- Source: HAL-525 (the "added by the assistant" mark); HAL-18271 plan rev 2, section 2.4; HAL-18397. The wording is HAL-525's, until the copy check

When the Studio's workspace trust check (`studio.workspace-trust-review`) shows a local integration, its Reaches row shall put "· added by the assistant" after each fixed host the assistant added to its sheet that the person didn't name, as the review folder in the profile records them (`app.review-assistant-added-hosts`), and after no other host. It shall do so in a new check and in a changed one. A host the sheet no longer has isn't shown, so its mark goes with it. The marks are read again after each Accept, Reject, write or Undo of the assistant's changes; when they change, the check shall be built again and the window told, without checking trust again.

## Examples

- Given the integration home-station reaches `api.weather.example` and `cdn.weather.example`, and the assistant added `cdn.weather.example`,
  when the trust check is shown,
  then Reaches lists "api.weather.example" and "cdn.weather.example · added by the assistant".
- Given the same integration changed since it was trusted,
  when the trust check is shown,
  then its Changed row has the same mark.
- Given the marks change after an Accept,
  when they are read again,
  then the window is told.
