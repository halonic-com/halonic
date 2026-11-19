# files.follow-host

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 4.6, save model 1.5 and 1.7; HAL-10534, HAL-11169, HAL-12964

While a workspace is open, the Files feature shall say what happens to its files outside Halonic wherever the user is: one toast for each batch of files taken in because they had no unsaved changes, and the toolbar's save note for each file held for Compare, "1 item not saved · Compare", which opens the file's tab. A note shall stop naming a file once the file is no longer held. When the host stops watching because the workspace has too many files, one warning toast shall give the host's reason, with no button, and stay until it's closed.

## Examples

- Given `a.agent.yaml` changed outside Halonic and had no unsaved changes, then a toast says "Reloaded a.agent.yaml: changed outside Halonic".
- Given 12 files were taken in as one batch, then one toast says "Reloaded 12 files changed outside Halonic".
- Given the host holds `a.agent.yaml`, then the save note says one item isn't saved, and its Compare opens `a.agent.yaml`.
- Given the user settles the held file in Compare, then the save note no longer names it.
- Given the host stops watching because the workspace has too many files, then one warning toast that stays gives its reason.
- Given following has stopped, then a later batch shows no toast.
