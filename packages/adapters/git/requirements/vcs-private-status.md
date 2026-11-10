# git.vcs-private-status

- Status: active
- Since: 0.1.0
- Source: HAL-2669 (review of #1091); the port's private workspace paths

The git `Vcs` shall leave every private workspace path out of the status, as `snapshot` and `listAt` do: `.studio`, `.env`, `.envrc` and `.env.*`, in any folder and whatever their case, even when `.gitignore` doesn't ignore them. A rename from or to a private path shall be left out too.

## Examples

- Given a workspace with an unignored `sub/.env` and a changed `sub/a.yaml`,
  when the status is read,
  then it lists `sub/a.yaml` and not `sub/.env`.
