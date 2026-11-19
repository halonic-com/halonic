# studio.workspace-files-watch-limit

- Status: active
- Since: unreleased
- Source: HAL-12964; HAL-12952 UX check F2; HAL-11253

When the workspace's watch stops because the folder has more than the shell's file limit, the Studio shall say so once for the open workspace: one warning toast with the shell's sentence and no button, which stays until the user closes it. It shall give the sentence to a listener of the Files host that comes after the watch stopped. Any other watch failure shall show nothing, and nothing shall be shown once the workspace is closed.

## Examples

- Given the watch fails twice with the file limit, then one warning toast says "This folder has more than 50,000 files, too many to watch for changes made outside Halonic. Open a smaller folder to see them as they happen." and stays.
- Given the watch failed with the file limit, when a listener comes later, then it is told the sentence at once.
- Given the watch stops for another reason, then no toast is shown.
- Given the workspace is closed, when the watch then fails with the file limit, then no toast is shown.
