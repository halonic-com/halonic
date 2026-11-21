# Decision: reading a workflow also says why its run can't start

- Task: HAL-12368
- Approval: the team's call on HAL-12368 (small detail of an approved screen, HAL-2282), from Sofia's UX check on HAL-12363 (L4, L5 and rule N5) and her note on HAL-12368 from the UX check on HAL-12679 (L4 takes Elena's Harness page step); Liam reviews and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WLnXUNDog6rrUVReMJelGgxDI/gyooRDOLOjGwK5N1iNNyMiA3gBAHnEpZd2kGgaHzKlOOLILHVUlSd1KTisBw==

## What changes

The requirement grows; nothing it gave before is removed and no test was weakened.
`studio.workspace-workflow-read`: when the window has an engine, reading one workflow also says,
from the same files with their unsaved changes, why the engine would refuse to start its run: an
agent that lists a connector the window can't start, or an agent in a harness program where no agent host runs (HAL-10849). It gives the same sentence and next
step that `studio.engine-service` gives after **Run** is pressed: "Set Writer to Halonic on its
Harness page to run it now." for a harness program, and "To start it, run this in a terminal:" with
`halonic run reply` for a connector.

Where the agent host starts a run's `stdio` connectors (HAL-13344), the check follows the engine:
only a connector that isn't a `stdio` one of the agent's hub or the workspace's library stops the
run, named in the reason. To see those connectors, the Workflows page's read of the files lists
`library/` as well as `hubs/`.

The harness case has no command: under rule N3 a step inside Studio wins over a terminal command
(Sofia, UX check on HAL-12679, with Elena's words from HAL-12642).

## Why

Both refusals are known from the files before the press. With the reason in hand, the workflow page
makes **Run** unavailable and shows the reason and the next step under it, linked by
`aria-describedby`, instead of letting the person press **Run** only to be refused.

The run-starting tests moved from `workspace-workflows.test.ts` to `workspace-workflows-start.test.ts`
to keep the file under 500 lines, so the first file has fewer tests. None were dropped.

In the same way, the tests for a run that can't start (the card after **Run** is pressed, and **Run**
unavailable) moved from `start-run.test.tsx` to `start-refused.test.tsx`, so `start-run.test.tsx` has
one test fewer.

`studio.engine-service` makes fewer `expect` calls but checks more: the test of a routine's own
agent now matches the whole refusal (its sentence and its next step) in one `toMatchObject`, where it
checked the kind and a word of the message in two calls; and the harness refusal checks
`command: undefined` inside its `toEqual` instead of a separate `not.toHaveProperty`.

## Covers

- `studio.workspace-workflow-read`
- `studio.engine-service`
- `apps/studio/src/workflows/workspace-workflows.test.ts`
- `packages/studio/features/workflows/src/start/start-run.test.tsx`
