# Decision: the signal loop guard fails closed

- Approval: Paperclip task HAL-14305, on the plan Liam approved there (20 Nov) and Julian's conditions for 3b on HAL-14332; Liam approves this note in review
- Kind: internal

## What changes

`routines.signal-loop` let a start go ahead when a run on the chain was no longer in the store.
Now that the scheduler starts routines on signals, Julian asked on HAL-14332 that the guard fail
closed. The requirement now says:

- a run on the way back that the store no longer has, or a signal start without its `signalId`,
  is refused as `unknown`, instead of ending the chain;
- a store read that fails rejects, and the caller refuses the start.

The one example that said "the start may go ahead" for a gone run now says it is refused, and
its test changes the same way. Every other example and test stays.

## Covers

- routines.signal-loop
