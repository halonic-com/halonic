# Acme: the example workspace

Acme is an invented shop. The docs, the demo scripts and the launch texts take
their examples from this workspace, and `halonic init --example acme` copies
it into a new `acme` folder. Every name, email and order in it is made up.

It runs on the test model (`providers/mock.yaml`): scripted replies, no
network and no key. No file in it points at a real service.

## What's in it

| Hub | Part | What it does | File |
| --- | --- | --- | --- |
| Support | Agent **Sorter** | Decides whether an email is a `refund`, a `question` or `spam` | `hubs/support/agents/sorter.agent.yaml` |
| Support | Agent **Writer** | Reads the email and drafts a reply | `hubs/support/agents/writer.agent.yaml` |
| Support | Workflow **Support reply** | Reads the email, classifies it, drafts a reply, then a person reviews it | `hubs/support/workflows/support-reply.workflow.yaml` |
| Support | Tests | The Support reply workflow's five test cases | `hubs/support/workflows/support-reply.test.yaml` |
| Reports | Agent **Reporter** | Writes the weekly support report | `hubs/reports/agents/reporter.agent.yaml` |
| Reports | Workflow **Weekly report** | The Reporter's one step | `hubs/reports/workflows/weekly-report.workflow.yaml` |
| Reports | Routine | Runs the Weekly report every Monday at 9:00 | `hubs/reports/workflows/routines/weekly-report.routine.yaml` |

In the Support reply workflow, the step **Approve this reply?** (`review`)
waits for a person to approve the draft. `approve` finishes the workflow with
the reply approved. `reject` finishes it without a reply. Nothing is actually
sent: this is an example. Spam ends right after the Sorter, with no draft to
review.

`examples/refund-question.json` is an input for the workflow: Sam's email
about a damaged order. The test model's script answers that one run: the
Sorter says `refund` and the Writer drafts a short, friendly reply.

The Reporter has no real support data. On the test model its weekly report is
a scripted text, so don't expect a real report.

## Keeping the example working

A test in the workspace package (`packages/core/workspace/src/acme-example.test.ts`)
loads this folder in CI and fails on any error or warning, so it stays valid
when the workspace format changes. When you change a name here, also change
the docs and the demo scripts that use it.
