# studio.workspace-instruction-trust

- Status: active
- Since: unreleased
- Source: HAL-10524 (G1); instruction trust UX checklist S4, S5, S7

The Studio app shall let the run page ask a person to trust one agent's instructions, the agent in the run's hub, in the open workspace, through the shell's own dialog, and answer `trusted`, `declined`, `busy` or `unavailable`. Only the shell saves, and only on a yes. Where the shell can't ask (a served page or a phone), the app shall provide no way to ask, so the page offers no button.

## Examples

- Given the person says yes in the shell's dialog,
  when the page asks to trust an agent's instructions,
  then the answer is `trusted` and the pin is saved for that agent in its hub in the open workspace.
- Given the person says no,
  when the page asks,
  then the answer is `declined` and nothing is saved.
- Given the shell is already asking another question,
  when the page asks,
  then the answer is `busy`.
- Given the shell can't write the record, or gives no answer,
  when the page asks,
  then the answer is `unavailable` and carries none of the shell's text.
