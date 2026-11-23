# workflows.tests.try-it-changes

- Status: draft
- Since: unreleased
- Source: HAL-16808; flow-assistant 4.4 ("Try it and Test use what's saved, changes to review included"); `agents.chat.try-it-changes-line`

While the workflow has changes from the assistant that the person hasn't accepted yet, its Tests page shall show the line of `agents.chat.try-it-changes-line` above the summary, with the host's watch of that workflow, since tests read those changes as Try it does. Where the host has no watch, or nothing is left to review, no line shall show.

## Examples

- Given 2 changes to review in *Digest*,
  when the person opens its Tests page,
  then it says "Includes 2 changes from the assistant you haven't accepted yet." above "2 tests".
- Given a host without the watch,
  then the Tests page shows no such line.
