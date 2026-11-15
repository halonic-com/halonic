# library.new-skill

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P5d); flow-library 3.2; microcopy 11.2

When a person presses **New skill** on the Skills tab, the Library shall open a dialog with Name, Hub (only with more than one hub) and "When to use it", and under Name the skill's folder ("Folder: hubs/acme/library/skills/acme-refunds/"), which follows the name and shows the skills folder alone while Name is empty. If **Create** is pressed with Name empty, then the dialog shall show "Give it a name." and, with "When to use it" empty, "Say when an agent should use this skill.", make nothing and focus the first of them. Otherwise it shall make the skill through the new-skill host as one change and hand its reference on, so the caller opens its page. If making it fails, then the dialog shall stay open with what was typed and show "Couldn't create the skill: *reason*." with **Try again**.

## Examples

- Given Name "Refunds",
  when the name is typed,
  then the line under it reads "Folder: hubs/acme/library/skills/refunds/".
- Given both fields empty,
  when Create is pressed,
  then "Give it a name." shows and nothing is made.
- Given the host rejects with "The disk is full.",
  when Create is pressed,
  then the dialog shows "Couldn't create the skill: The disk is full."
