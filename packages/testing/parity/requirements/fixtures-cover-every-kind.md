# parity.fixtures-cover-every-kind

- Status: active
- Since: 0.1.0
- Source: HAL-108 (plan 15, phase 1: schema fixtures for every file kind)

The parity fixtures shall hold, for every file kind the old schema and loader accept, a valid file in the base workspace and at least one invalid case, and every fixture shall have a recording from the reference commit.

## Examples

- Given the committed fixtures, then the base recording has a passing file for each of the 14 kinds: workspace, deployments, models, provider, runtime, knowledge, collection, connector, skill, hub, agent, workflow, workflowTest and routine.
- Given the committed fixtures, then each kind has a case with a fault, and each case's recorded.json names that case and the reference `784f78d`.
- Given the base workflows, then they hold a foreach, a parallel state, a nested workflow, a wait state with an approval event and a timer, and the workspace has a budget.
