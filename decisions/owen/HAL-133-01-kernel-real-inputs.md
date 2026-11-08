# Decision: say when a disposed routine tick stores no last tick

- Requirement: `app.routine-scheduler` (`packages/core/app/requirements/routine-scheduler.md`)
- Task: HAL-863, part of HAL-133, from Elena's review of PR #74 (HAL-142, nit 1)
- Approval: the task asks for the dispose wording nits; the maintainer approves it in review

## What changes

The sentence on a dispose during a tick said the tick shall "store no last tick". It now says it
shall store no last tick _if it left due runs unstarted_. Nothing else in the requirement changes.

## Why

The scheduler checks for a dispose before each start. A dispose during the last (or only) start
lets that start finish, and then every due run has been started, so the tick stores the last tick
as usual. That is correct: there is nothing left for the next host to pick up. The old wording
promised more than the code does, and more than it should. The code and tests stay as they are;
the requirement now matches them.

No test was weakened or removed.
