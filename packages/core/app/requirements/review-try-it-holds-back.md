# app.review-try-it-holds-back

- Status: active
- Since: 0.1.0
- Source: AI changes 1.5 (HAL-3228); HAL-65 section F, `workspace.trust.try-it-leaves-out` (HAL-3268, HAL-3341); HAL-3277

When Try it or Test asks the review service for its source, the service shall give the workspace's files with the baseline's value, until the person accepts the change, for each change to review that touches:

- **permissions**: an agent's or a method's tools and step limit, the run logs, collections and subagents it may use, and the budget in `workspace.yaml`;
- **trust and sandbox**: an agent's harness, working folder and allowed sites, a runtime, the default runtime in `workspace.yaml` or a hub, and the privacy settings in `workspace.yaml`;
- **connections**: the connectors an agent, a hub or a routine uses, a connector with its address, command, environment, secrets and tools, and a knowledge provider and its settings;
- **models and providers**: `models.yaml`, a provider and a hub's own model aliases.

It shall use the file's value for everything else, a switch to a model alias that exists included. It shall leave out a new file, or a new method of an agent, that sets any of those parts, and use the assistant's delete of a file it doesn't hold back whole. It shall hold back a change the assistant writes after the source is built in the same way, when the source reads the file. It shall build the source in memory, write nothing and start nothing. It shall say which files it leaves out when it builds the source, with one reason and the number of line changes each, and their sum. When it leaves anything out, the source's version shall differ from the workspace's.

## Examples

- Given the assistant renamed agent `clerk` and added a site to its allowed sites,
  when Try it asks for its source,
  then the source has the new name and the old sites, and one file is left out for trust and sandbox.
- Given the assistant added the alias `large` to `models.yaml`,
  when Try it asks for its source,
  then the source has `models.yaml` as it was, and one file is left out for models.
- Given the assistant switched agent `clerk` from alias `small` to `large`, both in `models.yaml` already,
  when Try it asks for its source,
  then the source has the switch and leaves nothing out.
