# settings.about-section

- Status: active
- Since: 0.1.0
- Source: HAL-1295 (part 3); flow-install-update 4.2, 4.3, 4.7 (HAL-1114); ux-checklists-install 3.2 to 3.4, 3.8 (HAL-1151); failure path 2 (HAL-1668)

The Settings window shall list **About Halonic** under the host sections, after Agent sandbox. Where the app gives an updater, the section shall show "Halonic" and the version that runs, one status line that does not repeat the version, **Check now**, the **Update Halonic automatically** switch and four links (Release notes, Source code, Licence, Report a problem). The status line shall say, in the approved words, each state: not checked yet, up to date with when it was checked, automatic updates off, can't check with a reason in words and the last check only when there was one, available, downloading with how much has arrived and a bar, couldn't download with a reason in words, ready, and didn't install. A signature that doesn't match shall show as a warning Callout in place of the status line. A reason shall never be raw error text. The bar shall show the fraction done only when the total is known. Opening the section shall check and download nothing: each of Check now, Download, Cancel download, Try again and the switch shall act only on a press. After Check now, the section shall announce the result with the version, also when nothing changed. When another tool manages updates, the section shall offer no Download, Cancel download or Try again and no switch. Without an updater the section shall show one view-only line and the four links.

## Examples

- Given the last check answered at 09:12 today and automatic updates are on,
  when the section opens,
  then it reads "Up to date. Checked today at 09:12." and the updater was asked only for its status.
- Given a check that could not reach the server and never succeeded before,
  when the section words it,
  then it reads "Couldn't check for updates: you're offline." with no "Last checked".
- Given a download of 12 of 48 MB,
  when the section opens,
  then it reads "Downloading Halonic 0.1.1… 12 of 48 MB" with a bar at 25% and **Cancel download**.
- Given the signature of 0.1.1 doesn't match,
  when the section opens,
  then a warning Callout says it wasn't installed and that 0.1.0 keeps working.
- Given the person presses **Check now** and the server answers it is up to date,
  when the check ends,
  then the announcer says "Halonic 0.1.0 is up to date. Checked today at 09:12."
- Given Scoop manages updates and 0.1.1 is available,
  when the section opens,
  then it says 0.1.1 is available and shows no Download button and no switch.
