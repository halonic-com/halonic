# routines.list.rows-and-states

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 3), HAL-12323, HAL-13843, HAL-14940; flow-routines 2.1; microcopy 12.1; states RT

The Routines place shall list the workspace's routines under "Routines" and the sentence "A routine starts a workflow or an agent on its own: on a schedule or every so often. Routines start on time only while `halonic routines watch` is running in a terminal." (the app has no scheduler of its own in 0.1 and `routines watch` checks no mail, HAL-12323) in one section per hub, each row with the routine's letter avatar, its name, the routine as one line, its next start time when it is on, can start and runs on a clock, and one state chip (**Can't start** when the workflow or agent it starts isn't in the workspace, else **Off**, else **Paused until trusted**, else **Needs sign-in again**, else **Needs you**), open a routine in its tab when a row is chosen, and show the loading, empty, no-match and can't-load states in the approved words.

## Examples

- Given hubs "acme" and "beta" and the routines "Weekly report" and "Daily" in acme, then acme lists "Daily" and "Weekly report" with their one-line summaries, and beta says "No routines in beta yet.".
- Given the routine "Daily" is on and next starts tomorrow at 07:30, then its row shows "next tomorrow 07:30"; a routine that is off shows the chip "Off" and no time.
- Given a routine is on in an untrusted workspace, then its chip reads "Paused until trusted" and takes the place of "Needs sign-in again" and "Needs you".
- Given a routine is held for a Google sign-in, then its chip reads "Needs sign-in again"; given runs wait for a person, then "Needs you".
- Given the routine "Morning replies" starts the workflow support-reply, which isn't in the workspace, then its row shows the chip "Can't start" in place of any other chip and no time, and screen readers hear "Can't start: support-reply isn't in this workspace"; the same goes for an agent that isn't there.
- Given the user chooses the row "Daily" in acme, then its tab opens; Ctrl-click, middle click and Ctrl Enter open it in a new tab.
- Given no routine in any hub, then the page shows "No routines yet", the sentence "A routine starts a workflow or an agent on its own, for example every weekday at 8." and no search field and no hub chips.
- Given the user searches for "zzz", then the page says `No routines match "zzz".` with **Clear search**.
- Given the routines are being read, then screen readers hear "Loading routines".
- Given the first read failed, then the page shows "Couldn't load routines", the engine's words and **Try again**.
- Given a read fails after the list was shown, then the rows stay and a line with **Try again** shows above them.
- Given the host says the routines changed, then the list reads them again and shows the new rows.
- Given the window is a phone, then the heading and sentence are there for screen readers only.
