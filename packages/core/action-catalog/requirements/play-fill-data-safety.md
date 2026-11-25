# action-catalog.play-fill-data-safety

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.8 and 7.9; task HAL-17557

When a request names `play.fill-data-safety@1` with a Play Console `developerId` and `appId`, the action-catalog package shall offer one `guided` step that opens the app's Data safety page on `https://play.google.com/console/` with numbered instructions, preview it in one sentence that says Halonic cannot check it, and give a manual guide that is a numbered list holding that address.

## Examples

- Given the developer id `4012345678901234567` and the app id `4976543210987654321`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://play.google.com/console/u/0/developers/4012345678901234567/app/4976543210987654321/app-content/data-privacy-security` and every following instruction is numbered.
- Given the app id `12/../34567890`,
  when they are parsed,
  then they are refused.
