# remote.phone-inbox-parts

- Status: draft
- Since: unreleased
- Source: HAL-19092 (Noah's design check HAL-19082, items 1–9; HAL-17514 `screens` group 3, p02a and p03a–p03g)

A paired computer's screen on the phone shall put its Inbox and Agents tabs in the kit's phone tab bar at the bottom of the screen, Inbox counting its waiting cards. The Inbox shall list each open card as a flat row with its kind's icon, the card's title (the question's first line), "<agent> asks" with its project, the lock hint when the phone can't answer it, and its wait ("Waiting 6 h") on the right, under a "Needs you · n waiting" list heading, and show skeleton rows when the first read takes longer than a moment. An opened card shall show a labelled Back, then the Needs you chip and its wait, the title as its heading and who asks, then the rest of the question. Its first option shall be filled and the others secondary. While its answers are off, a Callout above them shall say why, with Open settings in it when the phone has no screen lock. After an answer the options shall stay, turned off, under the line that says what became of it, followed by Next.

## Examples

- Given a computer with two waiting cards,
  when its screen opens,
  then a `nav` named after the computer comes after the Inbox, and its Inbox tab reads "Inbox, 2 waiting".
- Given a card asking "Ship phase 2 now?" then "The tests are green.",
  when the Inbox lists it,
  then its row shows "Ship phase 2 now?", "Chief asks · Halonic apps" and "Waiting …", and not the second line.
- Given a phone without a screen lock,
  when the person opens a card,
  then "Set a screen lock on this phone to answer from it. Reading still works." and Open settings are in a Callout above the options.
- Given an opened card,
  when the person picks Today and the host says it was answered,
  then "You chose: Today · <time>" shows above Today and Later, both turned off, and Next is under them.
