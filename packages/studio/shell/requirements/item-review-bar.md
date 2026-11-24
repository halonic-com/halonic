# shell.item-review-bar

- Status: active
- Since: unreleased
- Source: HAL-16805 (T14 PR 14a, HAL-1307); AI changes 1.2 (revisions 4 and 5, Noah's N3 and frames, Maya on HAL-3396) and section 3 (HAL-3228); T14 review panel note 4 (HAL-3820)

Where an item has changes the assistant made that are still to review, the shell's `ItemReviewBar` shall show a bar under the item page's header, named "Changes to review": the spark mark in `accent`, "The assistant changed <n> things here" ("1 thing" for one) at weight 500, then "<at> of <n>" in `fg-muted`, **Previous** and **Next** as small ghost buttons with arrows, and **Accept all** and **Reject all** as small secondary buttons, on `surface-subtle` with a 1px `border` and `radius-md`. Previous and Next shall wrap around: from the first change Previous shall go to the last, and from the last Next shall go to the first, so neither ever waits or is unavailable; each shall pass the page the position it goes to, so the page scrolls that change into view and moves the focus to it. "<at> of <n>" shall be a polite live region whose spoken text is "Change <at> of <n>". With one change the bar shall show neither the count nor Previous and Next. Without changes the bar shall not show. While the item's file changed outside Halonic, the bar shall show "Changed outside Halonic" and **Compare** in place of Accept all and Reject all. After a decision leaves fewer changes, the page's position shall stay where it was, or on the last change if it was past the end (`positionWithin`).

## Examples

- Given an agent with 3 changes to review and the bar on the first,
  when it renders,
  then it reads "The assistant changed 3 things here", "1 of 3" (spoken "Change 1 of 3"), Previous, Next, Accept all and Reject all.
- Given the bar on 3 of 3,
  when the user presses Next,
  then the page is asked to go to 1 of 3; and from 1 of 3 Previous asks for 3 of 3.
- Given one change to review,
  when the bar renders,
  then it reads "The assistant changed 1 thing here" with Accept all and Reject all, and no count, Previous or Next.
- Given the agent's file changed outside Halonic,
  when the bar renders,
  then it shows "Changed outside Halonic" and Compare, and no Accept all or Reject all.
- Given the bar on 3 of 3,
  when that change is accepted and 2 are left,
  then the position is 2 of 2.
