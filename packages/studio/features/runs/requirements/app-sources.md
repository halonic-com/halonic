# runs.app-sources

- Status: active
- Since: unreleased
- Source: HAL-18749 (Runs app PR 6); Liam's decision on HAL-18748; design revision 3 on HAL-18594, approved by the board on 25 Nov 14:48 UTC. Team row words and the source failure line decided by the team on HAL-18749.

Where the Studio reads the runs of the open workspace's teams (`services.all-runs`), the Runs page shall show the Runs app's list (`runs.app-list`) with the workspace's runs and each team's runs together, instead of the workspace's own list. A workspace run's row shall use the Runs page's own row words and leave test runs out. A team agent's run shall show the agent's name and role, such as "Ada · CTO", the task it works on, such as "ACME-7 Fix the login", or "Not on a task", and the team's name, such as "Paperclip · Acme". Its chip shall say "Queued", "Running", "Done", "Failed" for a failed or timed-out run, or "Stopped" for a run someone or Paperclip stopped, which goes to its day rather than to Failed. Its cost shall be what the team paid, else its tokens. For each source whose runs couldn't be read, the page shall show "Couldn't refresh the runs of {source}." and why, over the list, which keeps that source's last runs and every other source's runs.

## Examples

- Given a workspace "Acme Ops" with a run of Support reply and a team "Paperclip · Acme" whose agent Ada (CTO) ran on ACME-7,
  when the Runs page is shown,
  then it lists both runs, the second as "Ada · CTO" with "ACME-7 Fix the login · Paperclip · Acme".
- Given the team "Paperclip · Globex" whose runs can't be read,
  when the Runs page is shown,
  then it says "Couldn't refresh the runs of Paperclip · Globex." and still lists the workspace's runs.
