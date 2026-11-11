# shell.place-stacks

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 14), HAL-4654 (Settings under More); phone layout 2, "Back and history" (HAL-330); component specs 0.2 "Where Back goes" and 15.2 (HAL-175)

Where the Studio shows the phone layout, the shell shall keep one stack of pages for each of the phone's four places, Home, Inbox, Runs and More, so switching to another place shows it where the user left it and tapping the place already shown goes back to its top. Agents, Workflows, Routines, Library, Changes and Settings shall open as lists right above the More page. Back shall go one page up in the place's stack; at the top of Inbox, Runs or More it shall go to Home, and at the top of Home it shall leave the Studio. When a link opens a page of another place, the shell shall show that place and put the page on its stack, and Back from that page shall return to the place the link came from. The bottom navigation shall show on a place and on a list, and shall hide on an opened item.

## Examples

- Given an approval card open in Inbox,
  when the user taps Runs and then Inbox,
  then the approval card shows again.
- Given an approval card open in Inbox,
  when the user taps Inbox,
  then the Inbox list shows.
- Given the More page,
  when the user opens Workflows,
  then the Workflows list shows with the bottom navigation, and Back goes to More.
- Given workflow "Support reply" open under More,
  when the user opens Settings,
  then Settings shows with the bottom navigation, and Back goes to More.
- Given the top of Runs,
  when the user goes back,
  then Home shows.
- Given the top of Home,
  when the user goes back,
  then the Studio leaves.
- Given run "#43" open in Runs,
  when the user follows its "Review in Inbox" link,
  then Inbox shows the approval card, and Back returns to run "#43".
- Given run "#43" open in Runs,
  then the bottom navigation is hidden.
