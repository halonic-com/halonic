# settings.restart-flow

- Status: active
- Since: 0.1.0
- Source: HAL-1295 (part 4b); flow-install-update 4.4 to 4.6 (HAL-1114); ux-checklists-install 3.5 to 3.8 (HAL-1151)

Where the app gives an updater and no other tool manages updates, the status bar shall show **Restart to update**, with the update-ready icon before it, only while an update is ready and only in a window 900px wide or more, named "Halonic *0.1.1* is ready. Restart to update". Restart to update (the status bar item, About Halonic and Ctrl K's **Restart to update Halonic**, which Ctrl K lists only while an update is ready) shall restart at once when no run would stop. Otherwise it shall open the dialog "Restart Halonic now?", which says how many runs a restart stops, how many of them wait for the person, and that the update installs on quit, with **Cancel** focused and **Restart and stop *N* runs** as the only way to restart. Nothing shall restart by itself. The screen reader shall hear that a download started and that it is ready, once each, never the percentage. At a start after an update, one info toast shall say "Updated to Halonic *0.1.1*" with **What's new**; at a start after an update that didn't install, one error toast shall say so with **Try again**, and after a second failure of the same version it shall add "Download it from the release page." with **Open release page**. Each toast shall show once.

## Examples

- Given 0.1.1 is ready and nothing runs,
  when the person presses **Restart to update**,
  then the app restarts and no dialog opens.
- Given 2 runs are running and 1 of them waits for the person,
  when the person presses **Restart to update**,
  then the dialog says "2 runs are still running, including 1 that's waiting for you. Restarting stops them." and its button reads **Restart and stop 2 runs**.
- Given Scoop manages updates,
  when 0.1.1 is available,
  then the status bar shows no Restart to update.
- Given the last start finished an update to 0.1.1,
  when the window opens,
  then an info toast says "Updated to Halonic 0.1.1" and shows it once.
