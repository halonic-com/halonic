# studio.desktop-rail-entries

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, the table in section 1, revision 2

The desktop app's features shall together give the icon rail, in this order: Home, Code, Library, Messenger, Inbox, Runs, Changes, then Settings at the bottom. Per kind of folder, the rail shall show:

- a workspace project: Home, Library, Messenger, Inbox, Runs, Changes and Settings, with Code only while it has a code folder inside;
- a code folder without items: Home, Code, Changes and Settings, with Inbox while an item waits and Runs while runs are recorded;
- a code folder with items: every entry;
- any folder without git: Changes as for a folder with git.

## Examples

- Given the desktop app's features and a workspace project with no code folder inside,
  when the rail's entries are listed,
  then they read Home, Library, Messenger, Inbox, Runs, Changes, Settings.
- Given the desktop app's features and a code folder without items,
  when the rail's entries are listed,
  then they read Home, Code, Changes, Settings.
