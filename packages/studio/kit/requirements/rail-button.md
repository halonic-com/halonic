# kit.rail-button

- Status: active
- Since: unreleased
- Source: HAL-20675; build plan P2 on HAL-20617, Noah's part recipes and sidebar icons (HAL-20672)

The kit's `RailButton` shall show one app in the icon rail as a button, or a link when it has an address, which it never follows: the app's 24px drawing centred in a 40px round target with the focus ring, named by its `label`. At rest the target shall have no fill; under the pointer, while pressed and while selected it shall be filled `surface-muted`. The selected button shall be `aria-current="page"` and draw the drawing it is given for selected, and in forced colours it shall have a 2px `Highlight` edge. When its count is above 0, it shall show the count in a 20px `accent` badge 3px above and 5px beyond the target's top end, with a 2px ring in the rail's `canvas` colour, and a screen reader shall hear the count's words after the name. Its name shall show as its tooltip, beside it (`kit.tooltip-beside`), and the button shall not be described by it too. Clicking it shall call `onSelect`.

## Examples

- Given a RailButton "Messenger" with a count of 2 named "2 unread", selected,
  when it renders,
  then it is `aria-current="page"`, named "Messenger, 2 unread", its icon is drawn as selected, and the badge says 2.
- Given a RailButton "Library" with the address `#library`,
  when the user clicks it,
  then `onSelect` is called and the address isn't followed.
- Given a RailButton with a count of 0,
  when it renders,
  then it shows no badge and is named by its label alone.
