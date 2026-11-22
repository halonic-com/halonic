# inbox.proposal-done

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2; HAL-11945 section 3, row Q10 (the Done heading); `app.run-proposal-done-list`

The Inbox shall list the run proposals settled in the last 30 days under a collapsed **Done** heading after the Notices, the one settled last first, and show no heading while there are none. The heading shall carry no count, and a done proposal shall never count in Needs you or any badge. Each row shall show the proposal's title and, in place of its meta, what it came to: "Accepted 2 of 3 changes", "Rejected", or "Not reviewed" when nothing was accepted and a change was left undecided. A done row shall open a read-only summary: the title, the run's facts, what it came to, each change with what was decided on it ("Not reviewed" for one nobody decided), and **See run 01JD8Q ›**, with no diff and no Accept, Reject or Remove.

## Examples

- Given a proposal of run `01JD8Q` settled with 2 of its 3 changes accepted,
  when the Inbox opens,
  then a collapsed **Done** heading follows, and its row reads "Run 01JD8Q proposes 3 changes to Support triage" with "Accepted 2 of 3 changes".
- Given a proposal that expired with every change undecided,
  then its row says "Not reviewed".
- Given no settled proposal,
  then there is no **Done** heading.
- Given the row of run `01JD8Q` under Done,
  when the person opens it,
  then the page shows each change with **Accepted**, **Rejected** or **Not reviewed**, and **See run 01JD8Q ›**, and no button that decides.
