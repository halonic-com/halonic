# shell.item-review-focus

- Status: active
- Since: unreleased
- Source: HAL-18077 (a11y check RV1, RV2 and RV5, HAL-18044); AI changes 1.2 and 1.3 (HAL-3228); T14 review panel note 4 (HAL-3820)

When an Accept or Reject on a mark, or Accept all or Reject all, is done, `useItemReview` shall read the review again and, where the focus fell to the page's body, move it to the mark of the change now at the decided one's place (or the last change), through the page's `goTo`; with no change left, to the page's `h1`. When a decision waits because the file changed outside Halonic, the item bar shall say "Changed outside Halonic" in a status region and move the focus to **Compare**, which the line describes. A mark for an important change shall be named "Important, <sentence>".

## Examples

- Given 3 changes and the focus on the first one's Accept,
  when it is accepted,
  then the focus is on the mark of the change that is now first.
- Given one change left,
  when Accept all is done,
  then the focus is on the page's `h1`.
- Given the file changed outside Halonic,
  when Accept all is pressed,
  then a status region says "Changed outside Halonic" and the focus is on Compare.
- Given the model change is important,
  when its mark renders,
  then it is named "Important, Model: small → large".
