# settings.unfenced-yes-where

- Status: active
- Since: unreleased
- Source: flow check C565 row 2 (HAL-15351, HAL-15373); words check C665 row 56, the board's option (a) on HAL-16069 (HAL-16763); builds on microcopy 24.1 R3, R5 and R16 (HAL-751, approved on HAL-1949) and `settings.unfenced-yes-take-back`; the dialog's title and button are a team decision (HAL-2282)

While Settings › Agent sandbox shows "Plugins and integrations" and the host says plugin code needs a yes that isn't saved, for a reason Studio has words for, the Settings feature shall show under the block's line an **Allow…** button. When **Allow…** is pressed, the Settings feature shall open the dialog "Allow plugins and integrations to run without the sandbox?" with the reason, its fix and its docs link in the words of `runnerUnfencedWords`, and the checkbox "I understand plugins and integrations run without the sandbox on this computer", the plugin trust check's words (R5); **Allow** shall stay unavailable until the box is ticked, and a tick shall count only for the reason it was given for. When **Allow** is pressed, the Settings feature shall ask the host to save the yes for that reason, through the window's one yes object, the one a plugin's Review saves it through, so it is the same yes for the whole computer; once the host has saved it, it shall read the status again, close the dialog, move the focus to the block's heading and announce "Allowed without the sandbox". If the host saved nothing, because the reason changed or a Take back was under way, the Settings feature shall read the status again, untick the box and move the focus to it, read out the reason that holds now, and keep the dialog open while a yes is still needed. If the host refuses, the dialog shall say why: "Halonic couldn't save your yes to run plugins and integrations without the sandbox." for the host's kind `allow_failed`, otherwise the reason the shell's `errorReasonFor` gives. While a yes is saved, while the host can't say, and for a reason Studio has no words for, the Settings feature shall show no **Allow…**.

## Examples

- Given Halonic runs inside a container and no yes is saved,
  when Settings › Agent sandbox opens,
  then "Plugins and integrations" has **Allow…**, and pressing it opens a dialog with "Halonic is running inside a container, and the sandbox can't start there." and the checkbox, with **Allow** unavailable.
- Given the box is ticked,
  when **Allow** is pressed and the host saves the yes,
  then the dialog closes and the block reads "Allowed without the sandbox" with **Take back**.
- Given a yes is saved,
  when **Take back** is pressed and the host has taken it back,
  then the block shows **Allow…** in place of **Take back**.
- Given the box is ticked for `container`,
  when **Allow** is pressed and the host answers that the reason changed to `no-sandbox`,
  then the dialog stays open with the `no-sandbox` reason and the box unticked.
