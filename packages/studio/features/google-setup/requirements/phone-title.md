# google-setup.phone-title

- Status: active
- Since: unreleased
- Source: HAL-17215; phone check HAL-17210 (C47); follows the collection page's phone title (HAL-13651)

While the device is a phone, the read-only Google setup view's title "Google for x@example.com" shall be for screen readers only, because the phone's top bar already names the item, and it shall still take the focus when the item opens. In a served window on a desktop browser, which has no phone top bar, the title shall stay visible.

## Examples

- Given a phone,
  when the item opens,
  then the title "Google for x@example.com" is for screen readers only and has the focus.
- Given a served window on a desktop browser,
  when the item opens,
  then the title "Google for x@example.com" is visible.
