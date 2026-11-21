# cli.run-connector-warning

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a run whose connector's program was missing ended "✓ Ask finished" with no word about the connector); its own cause lines spelled out when `halonic tools review` changed its words on HAL-13829; the plugin lines from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools")

When a run's log has a `connector.listing-failed` event (`events.connector-listing-failed`), `halonic run` shall warn on stderr, once for each connector, also with `--json`, and go on: line 1 "! <connector> didn't start, so its tools are off in this run.", then, indented under it, the cause and its fix for a missing program, "The program <program> isn't on this computer." and "Install <program>, or change the command in <file>.", naming the connector's file by its path, or as "the <connector> connector file" when it has no file in the workspace, for a secret that isn't set, "The secret <name> isn't set on this computer." and "Save it with halonic secret set <name>, or set HALONIC_SECRET_<NAME>, then try again.", for a plugin that isn't trusted yet (`plugin-not-trusted`), "The plugin <plugin> isn't trusted yet." and "Review and trust it with halonic trust --plugin <plugin>.", or for a plugin that changed since it was trusted (`plugin-changed`), "The plugin <plugin> changed since you trusted it." and "Review what changed and trust it again with halonic trust --plugin <plugin>." The cause line doesn't start with "Couldn't list the tools", as `halonic tools review` does (`cli.commands.tools.connector-start`), because line 1 already says the connector didn't start. For another cause, line 1 shall be "! <connector> couldn't list its tools, so they are off in this run." with the `halonic tools review <connector>` command that shows why. A connector for which the log already has a `connector.part-off` (`events.connector-part-off`) shall get no such warning, because the run already warned for each of its parts (`cli.plugin-local-tools`). The warning shall not change the run's result or its exit code.

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
- Given Acme's Writer uses the connector `files` of the plugin `files`, which is added but not trusted yet,
  when `halonic run support-reply` runs,
  then stderr has "! files didn't start, so its tools are off in this run.", "  The plugin files isn't trusted yet." and "  Review and trust it with halonic trust --plugin files." once, instead of the `halonic tools review` line.
- Given a `connector.listing-failed` with `why: "plugin-changed"` and `name: "files"` for `handbook`,
  when the run's events are followed,
  then the cause line is "  The plugin files changed since you trusted it." and the fix "  Review what changed and trust it again with halonic trust --plugin files."
- Given a `connector.part-off` for `handbook`'s part `local:lister`, then a `connector.listing-failed` with `why: "other"` for `handbook`,
  when the run's events are followed,
  then there is no warning for the listing.
