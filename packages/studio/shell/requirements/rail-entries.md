# shell.rail-entries

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 1–6, 8 and 11, revision 2

The shell shall add the Home and Settings entries of the icon rail itself, before any feature registers. The shell shall let a feature add any other rail entry only through the point `rail.add`, naming one of Code, Library, Messenger, Inbox, Runs and Changes, with its name, icon, order and a rule that says when it shows. The shell shall show Home first, then each feature's entry whose rule holds for the open folder, by its order, then Settings at the bottom, whatever order the features registered in. The shell shall give every rule the same facts about the open folder: its kind, whether it has items, whether it has a code folder inside, its git state, whether runs are recorded, and how many Inbox items wait. While the active tab shows a sub-app whose rule no longer holds, the shell shall keep its entry, so an entry never disappears under the person. If a feature adds an entry that isn't one of these, adds Home or Settings, adds an entry with an empty name, or two features add the same entry, then the shell shall throw a `ShellError` that names the feature or features.

## Examples

- Given _runs_ adds Runs with order 50 and _inbox_ adds Inbox with order 40, registered in that order,
  when the rail's entries are listed for a workspace project,
  then they read Home, Inbox, Runs, Settings.
- Given no feature adds an entry,
  when the entries are listed,
  then they read Home, Settings.
- Given _library_ adds Library with a rule that holds only while the folder has items,
  when the entries are listed for a code folder without items,
  then Library is left out, unless the active tab shows Library.
- Given a feature adds Settings,
  when the shell is created,
  then a `ShellError` names the feature and says the shell adds it itself.
- Given a feature adds the entry "dashboards",
  when the shell is created,
  then a `ShellError` names the feature and lists the rail's entries.
- Given _inbox_ and _mail_ both add Inbox,
  when the shell is created,
  then a `ShellError` names both.
