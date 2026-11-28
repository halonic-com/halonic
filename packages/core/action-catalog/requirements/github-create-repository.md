# action-catalog.github-create-repository

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 16), 6.4, 7.8 and 7.9; task HAL-17563; plan with D1–D4 and Liam's conditions approved on HAL-21185

When a request names `github.create-repository@1` with a GitHub organisation `owner`, a repository `name` that matches `^[a-z0-9][a-z0-9-]{0,99}$`, a `visibility` of `private` or `public`, an `environment`, a `reviewer`, a `wait_timer`, `branches`, an Actions `secret` name and the agents' GitHub App `installation_id`, the action-catalog package shall offer an `irreversible` definition of twelve steps: a `call` that sends `POST /orgs/{owner}/repos` with the name, `visibility: private`, `auto_init` and our merge defaults (squash merging only, auto-merge on, branches deleted after a merge); a `check` of the repository that requires it to be private with the default branch `main`; `call` steps that add the label `built-on:paperclip` and create the environment; the reviewed guided step and check of `github.configure-environment` and of `github.set-actions-secret`, with the repository as `{name}` and the secret as `{secret}`; a guided step for the ruleset; a guided step on the installation's page for the agents' access; a guided step that makes it public when the request asks; and a last `check` that reads the settings back, which the preview shows next to our defaults. Each `call` shall have the target `{owner}/{name}`, so the user types the repository's full name in the shell's native dialog before it is sent.

The manual guide of `github.create-repository@1` shall be a numbered list that starts with `https://github.com/organizations/{owner}/repositories/new`.

## Examples

- Given a repository name `New-App`, `new_app`, `new.app`, `-new-app`, an empty one or one of 101 characters,
  when the parameters are parsed,
  then they are refused.
- Given a public repository and a user who doesn't confirm the native dialog,
  when step 1 is sent,
  then it is cancelled and nothing reaches GitHub.
- Given the recorded create, read, label, environment and read-back answers for `acme/new-app`,
  when those steps run through the fake sender,
  then each request is the recorded one, and the preview shows each setting next to our default.
- Given a recorded read whose default branch is `master`,
  when the gate is asked about step 3,
  then it refuses with the definition's reason, before the label is added.
- Given steps 1–9 recorded as succeeded and the access step (10) as failed,
  when Resume is planned,
  then it runs steps 10, 11 and 12 only.
- Given a request with this definition and `paperclip.add-project-repository@1` for org `acme`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://github.com/organizations/acme/repositories/new` and its last lines are on the Paperclip project's page.
