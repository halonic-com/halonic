# inbox.notices-section

- Status: active
- Since: 0.1.0
- Source: HAL-1305; flow-inbox 3.2; microcopy 10.1

When the workspace provides notices, the Inbox shall show a **Notices** section under Needs you, one flat row per notice: its title, **Open run** (where the window can open a run) and a **×** named "Dismiss *title*". **Open run** opens the newest run the notice names, in its hub. A fixed notice shall say "Fixed" in place of **Open run** and keep the ×. The × shall hide the notice and move focus to the next notice's ×, else the previous one's. With no notices, or no source, the heading shall be hidden. When the notices can't be read, the section shall say "Couldn't load notices", the reason and **Try again**, and Needs you shall stay as it is; when notices were already showing, they stay under the line "Showing the last…" the engine words give.

## Examples

- Given the notice "Daily summary failed at 06:00" for run r7 in hub acme,
  when you press **Open run**,
  then the run page of r7 in acme opens.
- Given two notices,
  when you press the × of the first,
  then the source is told to dismiss it and focus is on the second's ×.
- Given a fixed notice,
  then its row says "Fixed", has no **Open run** and still has the ×.
- Given no notices,
  then there is no Notices heading.
- Given notices that fail to load,
  then "Couldn't load notices" shows with **Try again**, and the Needs you list is unchanged.
