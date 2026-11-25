# overview.place

- Status: active
- Since: unreleased
- Source: HAL-18879 (click test step 7, HAL-18354); features 4, 10 and 11 of the HAL-17422 plan, approved by the board on HAL-10 (24 Nov); HAL-18954 (the not connected state, as the Messenger's `messenger.not-connected`, Sofia's team wording decision)

The Overview feature shall add the Overview place, which the sidebar shows under its Team heading. The place shall show the heading "Overview", then the recap under its heading "Recap", also when nothing changed, then the overview's agents and blocked work. In a Studio with no `AgentMessaging` source, it shall read nothing and show, under "Overview", the shell's No connections (`shell.no-connections`) with the line "Connect Paperclip to see who works on what and which work is blocked.", not "No agents yet.".

## Examples

- Given a source with no blocked work and nothing changed since the last recap,
  when the person opens Overview,
  then it shows "Recap", "Nothing changed since your last recap." and "Nothing is blocked.".
- Given a Studio with no source connected,
  when the person opens Overview,
  then it shows "Overview", "No connections", "Connect Paperclip to see who works on what and which work is blocked." and a "Connect Paperclip" button, not "No agents yet.", and reads nothing.
- Given that Overview,
  when "Connect Paperclip" is pressed,
  then Settings opens on its Connections section.
