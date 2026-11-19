# studio.served-settings

- Status: active
- Since: unreleased
- Source: HAL-12552 (Liam's decision, option 1); HAL-7919; HAL-6159 design, section 5; shell.settings-without-host

The served Studio shall have Settings with the sections this browser keeps, Appearance and Formats, saved in the page's storage, and shall leave out the host sections (Assistant, Agent sandbox, About Halonic) until `halonic serve` gives the page the computer's settings, so a phone never shows the computer's settings as if they were in memory on the phone, and Ctrl K offers no command that opens one.

## Examples

- Given a phone opens the served Studio,
  when the user taps More, then Settings,
  then the list has "On this phone" with Appearance and Formats, and no "On your computer" group.
- Given the served Studio in a wide window,
  when Ctrl K lists its commands,
  then it has Settings, and no command to open Assistant or Agent sandbox.
