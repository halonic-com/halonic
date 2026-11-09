# workspace.acme-example

- Status: active
- Since: 0.1.0
- Source: HAL-2336

When the repository's `examples/acme` workspace is loaded with `loadWorkspace`, the workspace package shall find no error and no warning in it, so the example that the docs, the demo scripts and `halonic init --example acme` take their examples from can't drift from the format.

## Examples

- Given `examples/acme`, when it is loaded, then it has no issue and the only files no kind places are its README and the input file `examples/refund-question.json`.
- Given `examples/acme`, when it is loaded, then it has 2 hubs, 3 agents, 2 workflows and 1 routine.
- Given `examples/acme`, when it is loaded, then the Support reply workflow's test file has 5 cases, and two of them take Sam's and Alex's mails as their input.
- Given `examples/acme`, when it is loaded, then the Support reply workflow's description reads `A customer's mail, for example: "Hi, my order #1042 arrived damaged. Can I get a refund?"` in full, because the request form shows it as the Message placeholder.
