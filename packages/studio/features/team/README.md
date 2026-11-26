# @halonicjs/studio-feature-team

The Team feature of the Studio: the Spend and seats and Pull requests screens, read from the
engine's `TeamStatus` through `TeamStatusService`. Seat problems (80%, 90%, "reaches 90% within an
hour", "not read for 30 minutes") are worked out here by `seatProblems`, and why a pull request is
stuck (Sofia's six rules) by `stuckReasons`, not in the port. Spend and seats lists Agents by spend
today, and opens an agent's or a seat's detail page (`TeamDetails`, offered as `TeamDetailsService`),
which add names, status words and tasks from `AgentMessaging`. Pull requests has four tabs: Needs
attention, All open, Queue (the merge queue's groups, the PRs waiting to enter and those taken out
today, laid out by `queueView`) and Merged today, with the queue's health in one line under them.
A row's title opens that PR's own page (`PullRequests.detail`): its state, since when it's stuck,
its Review, Queue and Task facts, its timeline and Open in GitHub.

- **Layer:** studio
- **Owner:** priya
- **Public API:** `@halonicjs/studio-feature-team` (the feature) and `@halonicjs/studio-feature-team/api`

## Example

```ts
const spendAndSeats = new SpendAndSeats(teamStatus, { now: () => new Date() });
const state = await spendAndSeats.read();
```
