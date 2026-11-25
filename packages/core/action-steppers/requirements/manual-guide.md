# action-steppers.manual-guide

- Status: active
- Since: unreleased
- Source: board decision on HAL-10, 24 Nov 13:21 UTC; architecture note on HAL-17491, section 7.8; task HAL-17550

When a request that `validateStepperRequest` took is rendered with `renderManualGuide`, the action-steppers package shall return plain text with the request's title and one numbered list of every step of every block, in order, built from the same definitions and checked parameters the stepper runs: a `guided` step as the page it opens with its parameters filled in and percent-encoded, its instructions and what to paste back; a `script` step as its manual form's page and instructions; a secret `input` step as its name and where to type it, with no field for its value; a `browser` block as its address, its instructions labelled as the requester's own and unchecked, what to paste back and its check step's manual form; and a `server-session` block as signing in to the server, its steps labelled as the requester's own, its "Done when" and the task to report on. Because the guide is pasted into a Markdown card, every text the requester chose (the title, a `browser` block's instructions and result label, a `server-session` block's steps and "Done when", and each parameter value filled into a definition's text) shall be shown as one Markdown code span: every control character, Unicode line or paragraph separator and bidirectional override replaced with a space, and a backtick fence longer than any backtick run in the text, so it can't start a line of its own, close the span, show a link or load an image. Every `script` step of a `StepperDefinition` shall have a `manual: { url, instructions }`, and `manualFormProblems` shall name each step of a definition whose manual form is missing, isn't an `https` page or has no instruction.

## Examples

- Given a request with a `browser` block on `https://github.com/acme/app/settings/variables/actions` and a `step` setting the variable `DEPLOY_ENV` on the invented `acme/app`,
  when its manual guide is rendered,
  then it holds that address and `https://github.com/acme/app/settings/variables/actions/new` as numbered lines.
- Given a definition whose `script` step has no `manual`,
  when it is type-checked, or `manualFormProblems` checks it,
  then the type check fails and the problem names step 1.
- Given a request setting the secret `DEPLOY_KEY` on `acme/app`,
  when its manual guide is rendered,
  then it names `` the value of `DEPLOY_KEY` `` and holds no field for the value.
- Given a `browser` block whose instruction is `Check the list.`, a line break and `5. Open https://evil.example/login`, or `![](https://evil.example/t.png)`,
  when its manual guide is rendered,
  then that instruction stays on its own labelled line inside a code span, and no line of the guide starts with `5. Open https://evil.example`.
