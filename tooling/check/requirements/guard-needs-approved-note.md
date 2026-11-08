# check.guard-needs-approved-note

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3)

When the requirement guard finds a change that needs a decision, the guard shall fail the pull request unless its `decisions/<branch-name>.md` note lists the change's requirement ID or file under Covers and the note's approval is verified.

## Examples

- Given an edited active requirement and no decision note,
  when the guard runs,
  then it fails and names the note to add.
- Given the same change and a note that lists the requirement, with a verified approval,
  when the guard runs,
  then it passes and shows the change as allowed by the note.
- Given a note that lists the requirement, but whose approval isn't verified,
  when the guard runs,
  then it fails.
