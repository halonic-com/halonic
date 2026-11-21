# kit.action-bar-focus

- Status: draft
- Since: unreleased
- Source: HAL-15338; Routines UX check RT10 (HAL-15304); flow-routines 5.2

The kit's `ActionBar` shall pass a button's `ref` on to that button, so a page can give it the focus, as the routine page gives **Run now** the focus once the sandbox can start.

## Examples

- Given an action bar with the one button **Run now** and a ref for it,
  when the page focuses the ref,
  then **Run now** has the focus.
