# inbox.proposal-items

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2; HAL-1305 comment of 11 Nov (status from the run record, the settle rule); HAL-11945 section 3, rows Q1, Q2 and Q8

The Inbox shall list one item for each run proposal that is open, however many items its files belong to, after the runs that wait for a person, newest first by when the run ended. The item shall give the run, how many files the run changed, counting those that can't be written, and the items they belong to with their names. It shall say how the run ended, read from the run's record and never from the proposal: finished when the run completed, stopped when it was cancelled or its budget stopped it, and failed for any other failure. A proposal is open until it is settled or no file in it is left undecided; a proposal where no file can be written stays open. Each open proposal counts in the Inbox's count.

## Examples

- Given run `01JD8Q` that completed and proposes 3 changes to `support-triage`, named *Support triage*,
  when the Inbox lists it,
  then it has one item, `proposal:01JD8Q`, with 3 changes to *Support triage*, finished.
- Given a run that was cancelled, one stopped by its budget and one that failed with an error,
  when the Inbox lists their proposals,
  then they read stopped, stopped and failed.
- Given a proposal with 3 files, one of which can't be written, and the other two accepted,
  when the Inbox lists it,
  then it has no item.
- Given a proposal where no file can be written,
  when the Inbox lists it,
  then it still has one item, with all its changes.
- Given a settled proposal,
  when the Inbox lists it,
  then it has no item.
- Given a run waiting on a tool call and two proposals,
  when the Inbox lists them,
  then the run's item comes first, then the newer proposal, then the older, and the count is 3.
