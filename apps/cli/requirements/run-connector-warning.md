# cli.run-connector-warning

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a run whose connector's program was missing ended "✓ Ask finished" with no word about the connector); its own cause lines spelled out when `halonic tools review` changed its words on HAL-13829; the plugin lines from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools"); the integration line from HAL-15250 (follow-up to HAL-14784: `halonic tools review` starts no integration's connector, so it can't say why one didn't list its tools); the stopped plugin's lines from flow check C600 #4 (HAL-15608), words with Sofia on HAL-15616; the stopped program's lines from HAL-15606 (C600 #1: a run whose connector's program stopped at start sent the person to `tools review` only to learn that); the refused start without the sandbox from HAL-15689 (Nina's C611 on HAL-15671: since HAL-15144 an integration can start without the sandbox with Studio's yes, yet a refused start still said it needs the sandbox and sent the person to `doctor`, which doesn't know the yes)

When a run's log has a `connector.listing-failed` event (`events.connector-listing-failed`), `halonic run` shall warn on stderr, once for each connector, also with `--json`, and go on: line 1 "! <connector> didn't start, so its tools are off in this run.", then, indented under it, the cause and its fix for a missing program, "The program <program> isn't on this computer." and "Install <program>, or change the command in <file>.", naming the connector's file by its path, or as "the <connector> connector file" when it has no file in the workspace, for a program that stopped by itself right after it started (`program-stopped`), "The program <program> stopped right after it started." and `halonic tools review`'s fix, "To see why, run the command and args from <file> yourself.", for a secret that isn't set, "The secret <name> isn't set on this computer." and "Save it with halonic secret set <name>, or set HALONIC_SECRET_<NAME>, then try again.", for a plugin that isn't trusted yet (`plugin-not-trusted`), "The plugin <plugin> isn't trusted yet." and "Review and trust it with halonic trust --plugin <plugin>.", for a plugin that changed since it was trusted (`plugin-changed`), "The plugin <plugin> changed since you trusted it." and "Review what changed and trust it again with halonic trust --plugin <plugin>.", for a plugin whose sandbox didn't work when it started (`plugin-stopped`, which names the plugin by its name), "The sandbox didn't work when the plugin <name> started, so none of it ran." and "Halonic tries <name> in the sandbox again the next time a run uses it.", or for a local integration whose start without the sandbox wasn't allowed (`unfenced-not-allowed`), why the sandbox isn't available as `app.runner-unfenced-words` gives it for the cause's code, and the refusal's fix (`cli.local-integration-unfenced-yes`), "Running it without the sandbox isn't allowed yet. To allow it, trust this workspace in Studio on this computer.", without its second sentence where a yes given in Studio doesn't reach the command, as that refusal leaves it out (Windows with the WSL sandbox, read from the profile's saved sandbox choice). The cause line doesn't start with "Couldn't list the tools", as `halonic tools review` does (`cli.commands.tools.connector-start`), because line 1 already says the connector didn't start. For another cause, line 1 shall be "! <connector> couldn't list its tools, so they are off in this run." with the `halonic tools review <connector>` command that shows why, or, for a local integration's connector (`transport: { integration }`), which `halonic tools review` doesn't start (`cli.commands.tools.integration-connector`), "Its integration needs the sandbox and a trusted workspace to start. To check both, run halonic doctor". A connector for which the log already has a `connector.part-off` (`events.connector-part-off`) shall get no such warning, because the run already warned for each of its parts (`cli.plugin-local-tools`). The warning shall not change the run's result or its exit code.

## Examples

- Given Acme's Writer lists a connector whose program `halonic-test-no-such-program` isn't on this computer,
  when `halonic run support-reply` runs,
  then stderr has "! handbook didn't start, so its tools are off in this run.", "  The program halonic-test-no-such-program isn't on this computer." and "  Install halonic-test-no-such-program, or change the command in library/connectors/handbook.connector.yaml." once, and the run goes on to wait for the reply's approval with exit 0.
- Given Acme's Writer lists `handbook`, whose program `node` writes an error and exits right after it starts,
  when `halonic run support-reply` runs,
  then stderr has "! handbook didn't start, so its tools are off in this run.", "  The program node stopped right after it started." and "  To see why, run the command and args from library/connectors/handbook.connector.yaml yourself.", and nothing the program wrote.
- Given a `connector.listing-failed` with `why: "other"` for `handbook`,
  when the run's events are followed,
  then the warning is "! handbook couldn't list its tools, so they are off in this run." and "  To see why, run halonic tools review handbook".
- Given a `connector.listing-failed` with `why: "other"` for `handbook`, whose file has `transport: { integration: { folder: handbook } }`, and `--dir acme`,
  when the run's events are followed,
  then the warning is "! handbook couldn't list its tools, so they are off in this run." and "  Its integration needs the sandbox and a trusted workspace to start. To check both, run halonic doctor --dir acme", with no `halonic tools review` line.
- Given a `connector.listing-failed` with `why: "program-missing"` and `name: "npx-nope"` for `handbook`, which has no file in the workspace,
  when the run's events are followed,
  then the fix line is "  Install npx-nope, or change the command in the handbook connector file."
- Given Acme's Writer uses the connector `files` of the plugin `files`, which is added but not trusted yet,
  when `halonic run support-reply` runs,
  then stderr has "! files didn't start, so its tools are off in this run.", "  The plugin files isn't trusted yet." and "  Review and trust it with halonic trust --plugin files." once, instead of the `halonic tools review` line.
- Given a `connector.listing-failed` with `why: "plugin-changed"` and `name: "files"` for `handbook`,
  when the run's events are followed,
  then the cause line is "  The plugin files changed since you trusted it." and the fix "  Review what changed and trust it again with halonic trust --plugin files."
- Given a `connector.listing-failed` with `why: "plugin-stopped"` and `name: "Weather"` for `handbook`,
  when the run's events are followed,
  then the warning is "! handbook didn't start, so its tools are off in this run.", "  The sandbox didn't work when the plugin Weather started, so none of it ran." and "  Halonic tries Weather in the sandbox again the next time a run uses it."
- Given a `connector.listing-failed` with `why: "unfenced-not-allowed"` and `name: "container"` for `handbook`, a local integration's connector, as a run in a container with no yes saved in Studio logs it,
  when the run's events are followed,
  then the warning is "! handbook didn't start, so its tools are off in this run.", "  Halonic is running inside a container, and the sandbox can't start there." and "  Running it without the sandbox isn't allowed yet. To allow it, trust this workspace in Studio on this computer.", with no `halonic doctor` line.
- Given the same event with `name: "windows"` on Windows with the WSL sandbox chosen,
  when the run's events are followed,
  then the fix line is "  Running it without the sandbox isn't allowed yet." with no line about Studio.
- Given a `connector.part-off` for `handbook`'s part `local:lister`, then a `connector.listing-failed` with `why: "other"` for `handbook`,
  when the run's events are followed,
  then there is no warning for the listing.
