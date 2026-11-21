# routines.list.rows-and-states

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 3), HAL-12323, HAL-13843, HAL-14940, HAL-14205, HAL-15082 (C540 #4), HAL-15485 (C583 #4, the page's "Changes not live yet"), HAL-15269 (C552-5); flow-routines 2.1; microcopy 12.1; states RT

The Routines place shall list the workspace's routines under "Routines" and the sentence "A routine starts a workflow or an agent on its own: on a schedule or every so often. Routines run while Halonic is open." (the app's engine starts routines while its window is open, HAL-14205; it checks no mail, HAL-12323) in one section per hub, each row with the routine's letter avatar, its name, the routine as one line, followed by " · Changes not live yet" while its saved changes aren't live, as its page says it (or, when it can't start, why and what to do, in the sentence its Starts card and Run now's toast give), its next start time when it is on, can start and runs on a clock, or in its place "couldn't start at *time*" ("yesterday *time*", "*day* *time*" within the week, then the date) when it is on and can start but the start of its newest due time was refused and no run started since, and one state chip (**Can't start** when the workflow or agent it starts isn't in the workspace or its file has an error `halonic validate` reports, as `halonic routines` says, else **Off**, else **Paused until trusted**, else **Needs sign-in again**, else **Needs you**), open a routine in its tab when a row is chosen, and show the loading, empty, no-match and can't-load states in the approved words.

## Examples

- Given hubs "acme" and "beta" and the routines "Weekly report" and "Daily" in acme, then acme lists "Daily" and "Weekly report" with their one-line summaries, and beta says "No routines in beta yet.".
- Given the routine "Daily" is on and next starts tomorrow at 07:30, then its row shows "next tomorrow 07:30"; a routine that is off shows the chip "Off" and no time.
- Given the routine "Weekly report" runs on Mondays as it is live and was saved on Mondays and Wednesdays, then its row says "Mondays at 09:00 → Analyst · Changes not live yet", and a routine whose saved file is live has no such words.
- Given a routine is on in an untrusted workspace, then its chip reads "Paused until trusted" and takes the place of "Needs sign-in again" and "Needs you".
- Given a routine is held for a Google sign-in, then its chip reads "Needs sign-in again"; given runs wait for a person, then "Needs you".
- Given the routine "Tick" is on, its 19:41 start was refused and no run started since, then its row shows "couldn't start at 19:41" in place of its next time; when it is off, it shows "Off" and no time.
- Given the routine "Morning replies" starts the workflow support-reply, which isn't in the workspace, then its row shows the chip "Can't start" in place of any other chip, the line "support-reply isn't in this workspace. Pick another workflow." in place of the routine as one line, and no time; an agent that isn't there gives "Pick another agent.".
- Given the routine "Monday note" whose input has `{{trigger.date}}`, which its trigger doesn't give, then its row shows the chip "Can't start", the line of that error, and no time.
- Given the user chooses the row "Daily" in acme, then its tab opens; Ctrl-click, middle click and Ctrl Enter open it in a new tab.
- Given no routine in any hub, then the page shows "No routines yet", the sentence "A routine starts a workflow or an agent on its own, for example every weekday at 8." and no search field and no hub chips.
- Given the user searches for "zzz", then the page says `No routines match "zzz".` with **Clear search**.
- Given the routines are being read, then screen readers hear "Loading routines".
- Given the first read failed, then the page shows "Couldn't load routines", the engine's words and **Try again**.
- Given a read fails after the list was shown, then the rows stay and a line with **Try again** shows above them.
- Given the host says the routines changed, then the list reads them again and shows the new rows.
- Given the window is a phone, then the heading and sentence are there for screen readers only.
