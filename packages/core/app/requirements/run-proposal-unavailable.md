# app.run-proposal-unavailable

- Status: active
- Since: 0.1.0
- Source: req-workspace `app.run-proposal-done` (a proposal whose ref is missing); req-inbox `inbox.proposal.review` ("This proposal can't be opened any more." with "Remove"); HAL-3248

When an open proposal's ref is missing, deleted outside Halonic, the proposal service shall report it as unavailable, and every call that needs the run's texts (Accept, its parts, Compare) shall fail with an unavailable error and write nothing. When the person removes an unavailable proposal, the proposal service shall keep its record, settled as unavailable, with each file still undecided left as not reviewed. It shall refuse to remove a proposal whose ref is still there.

## Examples

- Given `refs/halonic/proposals/01JD8Q` was deleted outside Halonic,
  when the Inbox asks about run `01JD8Q`'s proposal,
  then it is unavailable, and Accept all fails as unavailable with the saved files unchanged.
- Given run `01JD8Q`'s proposal is unavailable and the person rejected one of its 2 files,
  when they remove it,
  then the record keeps that file rejected and the other undecided, and it is settled as unavailable.
- Given run `01JD8Q`'s proposal still has its ref,
  when something asks to remove it as unavailable,
  then it is refused and the proposal stays open.
- Given run `01JD8Q`'s proposal was settled,
  then it is not reported as unavailable.
