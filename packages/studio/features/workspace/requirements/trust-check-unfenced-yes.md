# workspace.trust-check-unfenced-yes

- Status: active
- Since: unreleased
- Source: the "Runs" line design sections 4 and 7 (HAL-1873), microcopy 24.1 R5 and R12 (approved by the board on HAL-1949); HAL-3384 part 6, option B (Liam, 21 Nov), built on HAL-15144; the changed reason said, and the tick cleared when the host saved no yes for the same reason, from words check C665 row 54 (HAL-16065); the same reason read too, from words check C681 row 5 (HAL-16160)

When the check it shows asks for the person's yes to run integrations without the sandbox, the trust check shall show that checkbox above the buttons, after the unpinned one, and keep **Trust** unavailable, though focusable and described by the checkbox's words, until it is ticked. A tick shall belong to the check and the reason it was given for: a new fingerprint or a new reason clears it, and so does a **Trust** for which the host saved no yes, even when the status read again names the same reason. When the reason changed under a ticked box, or the host saved no yes and the status read again names the same reason, focus shall go to the unticked box and the dialog's polite region shall read the reason once, as the plugin check does. **Trust** shall pass on whether the box was ticked. A line marked as a warning shall be amber with the triangle, a row's warning after its name shall follow it as "· *words*", and a section with a warning mark shall carry the triangle before its heading; the triangle shall be hidden from screen readers, so the words carry the warning, never the colour or the mark alone.

## Examples

- Given a check whose integration isn't in the sandbox here and has no yes,
  when the person opens it,
  then "I understand plugins and integrations run without the sandbox on this computer" shows above the buttons and **Trust** can't be pressed until it's ticked.
- Given the person ticked the box,
  when the host's status names another reason,
  then the box is unticked again, focus moves to it and "On Windows, integration code can't run in the sandbox in this version of Halonic." is read once.
- Given the person ticked the box and pressed **Trust** while a Take back is under way,
  when the host saves no yes and the status names the same reason,
  then the box is unticked, focus moves to it, its reason is read once, and **Trust** can't be pressed until it's ticked again.
- Given an integration row flagged "not in the sandbox",
  then its name reads "home-station · not in the sandbox", with the triangle.
