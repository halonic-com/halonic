# cli.no-unfenced-run-yes

- Status: active
- Since: unreleased
- Source: HAL-12639 (C54 docs check, item Q2, decided by Liam); the store is `app.no-unfenced-run-consent`, the start is `cli.open-local-integration` and `cli.open-plugin-backend`

While no host offers the yes to run without the sandbox, the `halonic` command shall start local integrations and plugin backends with no saved yes, as the agent host does: where the fence isn't there, every start shall answer `needs-yes` and start nothing, even when a yes for that same reason lies in the profile's `unfenced-runs` folder. The command shall leave that file as it is.

## Examples

- Given a computer where the sandbox can't start and a yes for that reason placed by hand in `<profile>/unfenced-runs`,
  when a local integration or a plugin backend starts,
  then the start answers `needs-yes` for that reason, no runner starts, and the file still holds the yes.
