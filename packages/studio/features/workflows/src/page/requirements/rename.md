# workflows.page.rename

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b PR 1); UX checklist 10.2 Rename and 10.3 (the name as a rename field); flow-workflows 2.3; save model 5; a11y A15

When the host can rename the workflow, the workflows feature shall show the workflow's name in the page header as the shell's name field "Workflow name", on desktop only. As the user types, it shall say "A workflow called <name> already exists." under the field, tied to it, when another workflow of the same hub has the name in any case, and not apply that name. When the user presses Enter or leaves the field with a new name, it shall ask the host to rename the workflow, which keeps its id and file and is one undo step, and say "Renamed to <name>." to screen readers once it is renamed; when the host refuses, it shall show "Couldn't rename <name>" and the reason on a danger toast. Esc shall put the old name back. Where the host can't rename, and on a phone, the name stays a title.

## Examples

- Given Support reply, when the user types "Support answers" and presses Enter, then the host renames `acme/reply` and "Renamed to Support answers." is announced.
- Given acme also has Mail triage, when the user types "mail triage", then "A workflow called mail triage already exists." shows, and neither Enter nor leaving the field renames it.
- Given only beta has Billing, when the user types "Billing" and presses Enter, then it is renamed.
- Given "Support answers" typed, when the user presses Esc, then the field reads "Support reply" again and nothing is renamed.
- Given the host refuses the name, then a danger toast says "Couldn't rename Support reply" with its reason, and nothing is announced.
- Given a host without rename, or a phone, then the header's `h1` is the name as text.
