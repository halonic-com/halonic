# Acme: the example workspace

Acme is an invented shop. The docs, the demo scripts and the launch texts take
their examples from this workspace, and `halonic init <dir> --example acme`
copies it. Every name, mail and order in it is made up.

It runs on the test model (`providers/mock.yaml`): scripted replies, no
network and no key. No file in it points at a real service.

## What's in it

| Hub     | What                                                                                   | File                                                         |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Support | **Sorter** decides whether a mail is a `refund`, a `question` or `spam`                | `hubs/support/agents/sorter.agent.yaml`                      |
| Support | **Writer** reads the mail and drafts a reply                                           | `hubs/support/agents/writer.agent.yaml`                      |
| Support | **Support reply**: read the mail, classify it, draft a reply, then a person reviews it | `hubs/support/workflows/support-reply.workflow.yaml`         |
| Support | Its 5 test cases                                                                       | `hubs/support/workflows/support-reply.test.yaml`             |
| Reports | **Reporter** writes the weekly support report                                          | `hubs/reports/agents/reporter.agent.yaml`                    |
| Reports | **Weekly report**: the Reporter's one step                                             | `hubs/reports/workflows/weekly-report.workflow.yaml`         |
| Reports | The routine that runs it every Monday at 9:00                                          | `hubs/reports/workflows/routines/weekly-report.routine.yaml` |

In the Support reply workflow, the review step waits for a person. `approve`
ends it with the reply, `reject` ends it without the reply. Spam ends right
after the Sorter, with no draft to review.

`examples/refund-question.json` is an input for the workflow: Sam's mail
about a damaged order.

## Keeping it right

A test in the workspace package (`packages/core/workspace/src/acme-example.test.ts`)
loads this folder in CI and fails on any error or warning, so it keeps up with
the format. When you change a name here, also change the docs and the demo
scripts that use it.
