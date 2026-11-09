# kit.card

- Status: active
- Since: 0.1.0
- Source: HAL-1289, HAL-1563; base component specs 7

The kit's `Card` shall draw a bordered `surface` box with a 12px radius and no shadow at rest. When it has a `title` or a `label`, the kit shall render a header with that name and the card's `actions` on the right, and render the card as a `<section>` named by that header; a card shall take a `title` or a `label`, never both, and only a card with one shall take `actions`. When the `title` or `label` is empty and the card has `actions`, the kit shall still render the header row with the actions, in an unnamed card. When a Card is given `onClick`, the kit shall render the whole card as one button, with no header or actions, a lifted edge on hover and the focus ring. When a Card's `state` is `error`, its edge shall be `danger`, on hover too; when it is `disabled`, its title or label shall be `fg-disabled` (the whole box when it has no header), its body and header actions shall keep their own colours, and it shall not react to hover.

## Examples

- Given `<Card label="When">Every weekday at 9:00</Card>`,
  when it renders,
  then it is a `<section>` whose name is "When", with the caption label in capitals drawn by CSS.
- Given `<Card onClick={open}>…</Card>`,
  when the user clicks it,
  then `open` is called once.
