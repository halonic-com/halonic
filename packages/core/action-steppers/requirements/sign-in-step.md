# action-steppers.sign-in-step

- Status: active
- Since: unreleased
- Source: stream HAL-17488; the architecture note on HAL-17491 (row 15, sections 6.7 and 7.8); Liam's approval of option (A) with conditions on HAL-17545

The action-steppers package shall have a `sign-in` step kind for one part of a service's own sign-in, with the service `paperclip`, a phase (`start`, `approve`, `keep` or `test`) and a manual form, and no address, route or reviewed call of its own. A `sign-in` step without a manual form, with a manual page that isn't `https`, or with no manual instruction shall be a manual-form problem. The manual guide shall write a `sign-in` step as its manual form, and shall say to open a page only once when consecutive `sign-in` steps share it. When the user resumes a stopped stepper with any `sign-in` step not yet succeeded or skipped, the plan shall run every `sign-in` step again from the first one, because a sign-in's key and code live only while the stepper is open.

## Examples

- Given a definition whose four `sign-in` steps all name `https://paperclip.acme.example/` as their manual page,
  when its manual guide is rendered,
  then the guide says `Open https://paperclip.acme.example/` once, followed by each step's instructions.
- Given a `sign-in` step whose manual page is `http://paperclip.acme.example/`,
  when its definition is checked,
  then the check names that step: the manual form's page must be an https address.
- Given four `sign-in` steps where `start` and `approve` succeeded and `keep` failed,
  when the user resumes,
  then the plan runs steps 1, 2, 3 and 4.
