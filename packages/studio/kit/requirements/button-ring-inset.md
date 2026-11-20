# kit.button-ring-inset

- Status: active
- Since: unreleased
- Source: HAL-14579 (C422 RG1, decided by the team; from HAL-14203); base component specs 23.5

When a `Button` is given `ring="inset"`, the kit shall draw its keyboard focus ring inside the button (`focus-ring-inset`) instead of outside it, so a button in the last column of a scrolling grid, such as a collection record's ⋮, keeps its whole ring at the grid's edge, as the grid's cells do. Every other button shall keep the outer ring (`focus-ring`), and a button shall never carry both.

## Examples

- Given `<Button variant="ghost" size="sm" ring="inset" icon={…} label="More for Refund policy" />`,
  when it renders,
  then its classes include `focus-ring-inset`, and not `focus-ring`.
- Given `<Button>Save</Button>`,
  when it renders,
  then its classes include `focus-ring`, and not `focus-ring-inset`.
