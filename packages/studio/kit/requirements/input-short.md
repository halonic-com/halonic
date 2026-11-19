# kit.input-short

- Status: active
- Since: unreleased
- Source: HAL-12708; UX check on HAL-12689, nit 2 (the agent's Turn limit box was as wide as the page column)

The kit's `Input` shall take a `width`: `full`, the default, fills its column, and `short` fits about 6 characters of the Input's own text, at 14px and at a phone's 16px alike, for a small number such as a turn limit. A short box shall never be narrower than the 48px touch target, shall keep every state, size and focus look of the default box, and its hint and error shall still start at the Field's left edge.

## Examples

- Given `<Field label="Turn limit"><Input width="short" /></Field>`,
  when it renders,
  then the box fits its text, about 6 characters wide, and is at least 48px wide.
- Given an `Input` with no `width`,
  when it renders,
  then the box fills its column.
