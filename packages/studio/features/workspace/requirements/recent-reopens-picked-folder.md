# workspace.recent-reopens-picked-folder

- Status: draft
- Since: 0.1.0
- Source: HAL-6637 (Liam's decision: the desktop shell remembers picked folders across restarts), states-flow-map W2, W7 and E2 (HAL-5878); HAL-1291

When the user opens a Recent row whose folder isn't open in the window, the workspace switcher shall first have the app reopen the folder the user picked before, and shall open the workspace only when that worked. When the app can't reopen it, the switcher shall say why as for any folder that fails to open, so a folder that's gone reads "the folder is gone." and offers **Remove from Recent**. When the user removes a row from Recent, the switcher shall also have the app forget the folder, unless it is open in the window, and the row shall go even if forgetting fails.

## Examples

- Given the desktop app after a restart and `/work/acme` in Recent,
  when the user opens its row,
  then the app reopens `/work/acme`, and then the window shows "acme".
- Given `/work/old` in Recent, deleted since,
  when the user opens its row,
  then nothing opens, and it says "Can't open /work/old: the folder is gone." with **Remove from Recent**.
- Given `/work/old` in Recent and not open,
  when the user removes it from Recent,
  then the row goes and the app forgets `/work/old`.
