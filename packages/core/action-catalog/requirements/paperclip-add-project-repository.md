# action-catalog.paperclip-add-project-repository

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, section 5 (row 16); task HAL-17563; D4 of the plan Liam approved on HAL-21185

When a request names `paperclip.add-project-repository@1` with a Paperclip `host`, a company prefix `company`, a project key `project` and a GitHub `owner` and `repo`, the action-catalog package shall offer one `guided` step of risk `admin` that opens `https://{host}/{company}/projects/{project}` with numbered instructions for adding that repository to the project as a workspace, and shall have no `call` step, so no Paperclip write route is in the shell's list.

## Examples

- Given `{ host: "paperclip.acme.example", company: "ACME", project: "new-app", owner: "acme", repo: "new-app" }`,
  when the guided step's address is filled,
  then it is `https://paperclip.acme.example/ACME/projects/new-app`.
- Given a `project` of `../settings` or `New-App`, or a `repo` holding `?`,
  when the parameters are parsed,
  then they are refused.
