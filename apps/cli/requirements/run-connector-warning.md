# cli.run-connector-warning

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a run whose connector's program was missing ended "✓ Ask finished" with no word about the connector); its own cause lines spelled out when `halonic tools review` changed its words on HAL-13829

When a run's log has a `connector.listing-failed` event (`events.connector-listing-failed`), `halonic run` shall warn on stderr, once for each connector, also with `--json`, and go on: line 1 "! <connector> didn't start, so its tools are off in this run.", then, indented under it, the cause and its fix for a missing program, "The program <program> isn't on this computer." and "Install <program>, or change the command in <file>.", naming the connector's file by its path, or as "the <connector> connector file" when it has no file in the workspace, or for a secret that isn't set, "The secret <name> isn't set on this computer." and "Save it with halonic secret set <name>, or set HALONIC_SECRET_<NAME>, then try again." The cause line doesn't start with "Couldn't list the tools", as `halonic tools review` does (`cli.commands.tools.connector-start`), because line 1 already says the connector didn't start. For another cause, line 1 shall be "! <connector> couldn't list its tools, so they are off in this run." with the `halonic tools review <connector>` command that shows why. The warning shall not change the run's result or its exit code.

## Examples

- Given Acme's Writer lists a connector whose program `halonic-test-no-such-program` isn't on this computer,
  when `halonic run support-reply` runs,
  then stderr has "! handbook didn't start, so its tools are off in this run.", "  The program halonic-test-no-such-program isn't on this computer." and "  Install halonic-test-no-such-program, or change the command in library/connectors/handbook.connector.yaml." once, and the run goes on to wait for the reply's approval with exit 0.
- Given a `connector.listing-failed` with `why: "other"` for `handbook`,
  when the run's events are followed,
  then the warning is "! handbook couldn't list its tools, so they are off in this run." and "  To see why, run halonic tools review handbook".
- Given a `connector.listing-failed` with `why: "program-missing"` and `name: "npx-nope"` for `handbook`, which has no file in the workspace,
  when the run's events are followed,
  then the fix line is "  Install npx-nope, or change the command in the handbook connector file."
