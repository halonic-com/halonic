# kit.pointer-cursor

- Status: active
- Since: unreleased
- Source: HAL-19538; board design feedback on HAL-19536, item 2

The kit's theme shall show the pointer cursor over every element a person can click in every Halonic app: a button, a link with an `href`, a `summary`, a `select`, a checkbox, radio, file, colour or button `input`, and any element with the role `button`, `link`, `tab`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `option`, `treeitem`, `switch`, `checkbox` or `radio`. While such a control is `disabled` or `aria-disabled="true"`, it shall show the `not-allowed` cursor instead. The rule shall sit in Tailwind's base layer, so a part's own `cursor-*` class (a resize edge, a canvas port) still wins, and a text field keeps its text cursor. A source check over the kit, the shell, the Studio features and the Studio app shall fail an element with an `onClick` that the rule doesn't cover and that carries no `cursor-*` class, and any `cursor-default` or `cursor-auto` class, which would take the pointer away from a clickable part, unless a `pointer-check-ignore:` comment in the three lines above says why it needs no pointer (for example, it only hears its children's clicks, it only moves focus like a label, a press on it only closes something, or it sets its cursor in code).

## Examples

- Given a kit `Button`, a link in Messenger, a sidebar row or a menu item,
  when the pointer is over it,
  then the cursor is the pointer (hand).
- Given a `Button` with `unavailable={{ reason }}`,
  when the pointer is over it,
  then the cursor is `not-allowed`.
- Given a new `<div onClick={open}>` with no role and no `cursor-*` class,
  when the Studio app's tests run,
  then the pointer check fails and names the file and line.
