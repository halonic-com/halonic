# agents.chat.try-it-changes-line

- Status: draft
- Since: unreleased
- Source: HAL-16808; flow-assistant 4.4; AI changes 1.5; microcopy 14, "Try it with changes to review"; `app.review-try-it-holds-back`

While the agent has changes from the assistant that the person hasn't accepted yet, the Try it panel shall show at its top, in `text-small` `fg-muted`, "Includes 3 changes from the assistant you haven't accepted yet." with the number of those changes in the agent's file that Try it uses. For each reason Try it leaves changes out for, in the order permissions, sandbox, connections, models, it shall add "Leaves out 1 change to permissions until you accept it." with the number of changes left out for that reason. For the changes the assistant made before the workspace was trusted, it shall add "Leaves out 3 changes the assistant made before you trusted Acme." with the workspace's name. One change reads "1 change" and "it"; more read "*n* changes" and "them". A sentence with nothing to count shall not show, and the line shall go when nothing is left to review. The line shall follow the host's watch as the person accepts or rejects. Where the host has no watch, no line shall show.

## Examples

- Given 3 changes to review in *Sorter*, none left out,
  then the panel says "Includes 3 changes from the assistant you haven't accepted yet."
- Given 2 changes included and 1 left out for permissions,
  then the panel says "Includes 2 changes from the assistant you haven't accepted yet." and "Leaves out 1 change to permissions until you accept it."
- Given 3 changes made before the person trusted *Acme*,
  then the panel says only "Leaves out 3 changes the assistant made before you trusted Acme."
- Given the person accepts the last change,
  then the line goes.
