# @halonicjs/studio-feature-team

The Team feature of the Studio: the Spend and seats screen, read from the engine's `TeamStatus`
through `TeamStatusService`. Seat problems (80%, 90%, "reaches 90% within an hour", "not read for
30 minutes") are worked out here by `seatProblems`, not in the port.

- **Layer:** studio
- **Owner:** priya
- **Public API:** `@halonicjs/studio-feature-team` (the feature) and `@halonicjs/studio-feature-team/api`

## Example

```ts
const spendAndSeats = new SpendAndSeats(teamStatus, { now: () => new Date() });
const state = await spendAndSeats.read();
```
