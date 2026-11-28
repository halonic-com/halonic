# studio.desktop-rail-selection

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, line 2a, revision 2; review of #6852

Where the desktop app's features are registered, the rail shall put a tab in the entry the rail flows give it: Home for Home; Library for Library, Agents, Workflows and Routines, and for an agent, workflow, routine, skill, knowledge, collection or connector; Messenger for Overview and Spend and seats; Inbox for the Inbox; Runs for Runs, a run and a run's file; Changes for Changes and Pull requests; Code for Code's page and a file. Where the desktop app's features are registered, the rail shall put the Search page in no entry. Where the desktop app's features are registered, the rail shall open only pages that a desktop feature or the shell adds as a place, as the shell adds Home, or that a desktop feature adds as an item kind, as Files adds Code's page.

## Examples

- Given the desktop app's features,
  when the active tab shows the workflow `workflow/acme/reply`,
  then Library is selected.
- Given the desktop app's features,
  when the active tab shows Pull requests,
  then Changes is selected.
- Given the desktop app's features,
  when the active tab shows Code's page, `code/workspace/files`,
  then Code is selected.
