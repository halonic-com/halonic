# source-control.history

- Status: active
- Since: 0.1.0
- Source: HAL-10651 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.9 and 2.10; req-source-control (HAL-110) revision 4, `source-control.history.graph`; save model 2.8

The source control feature shall read the newest 20 versions that touch the workspace folder, newest first, each with its name (the first line of its message), its notes, its author, its time and its files, without drawing branches. Files in Halonic's own folders shall not count as part of a version. When the workspace has older versions it shall offer 20 more, and a later read, after a save or when the window comes to the front, shall keep the versions already shown. A repository without a version, and a folder without history, shall have none. When a read fails it shall keep the versions it had and say why. It shall read through the shell's `git log`, which is on the allow-list as it is.

The Changes page shall show these under "History", below the changes, grouped by day ("Today", "Yesterday", then the date), each row with the version's name, its author and the time. A version picked with a click or Enter shall show beside the list its name, author, date, notes and the files in it, never only on hover; ↑ ↓ move between versions. While the first read works it shall show skeleton rows labelled "Loading history"; an empty history shall say "No versions yet."; a failed read shall say "Couldn't load history" with the reason and Try again. A folder that is not a git repository shall show no History and say "History is off. Everything you save is used right away." under "Keep a history of your work".

## Examples

- Given 25 versions in workspace "acme",
  when the Changes page opens,
  then the newest 20 are read, and there are 5 older ones to show.
- Given the person shows 20 more,
  then all 25 are listed, still newest first.
- Given a repository with no version yet,
  then the history is empty and the read does not fail.
- Given a version that changed `hubs/sales/hub.yaml` and `.halonic/review/p1.json`,
  then its files are `hubs/sales/hub.yaml` only.
- Given the person picks "Sorter replies in Dutch",
  then its author, date, notes and files show beside the list.
- Given a folder without git,
  then the page says history is off and shows no History.
- Given git fails to read the history after it had been read once,
  then the versions stay as they were and the reason is kept.
