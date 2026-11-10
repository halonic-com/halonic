# kit.decision-rows

- Status: active
- Since: 0.1.0
- Source: HAL-3521; base component specs 20.6 (revision 17) and 15.4; visual review kit T1-F53

The kit shall give `decisionRows`, which lays out a wait step's events, in file order, as the rows of an `ActionBar`'s decision bar. The first event shall be `primary` on its own row. The other events shall be `secondary`: one shall have its own row, two shall share a row, and three or more shall each have their own row, in file order. No event shall be `danger`. Every event shall keep its label, busy label and handler as given. Without events it shall give no rows. The bar's own rules shall still apply: two buttons that share a row stack when either label doesn't fit its half, and while one is busy the others are unavailable.

## Examples

- Given the events Approve,
  when they are laid out,
  then there is one row with Approve as `primary`.
- Given the events Approve and Reject,
  when they are laid out,
  then Approve is `primary` on the first row and Reject `secondary` on its own row.
- Given the events Approve, Ask for changes and Reject,
  when they are laid out,
  then Approve is `primary` on the first row, and Ask for changes and Reject are `secondary`, side by side on the second.
- Given the events Approve, Approve and remember, Ask for changes and Reject,
  when they are laid out,
  then each is on its own row, in that order, with only Approve `primary`.
- Given Approve busy with "Approving…",
  when the bar renders,
  then Approve reads "Approving…" and the others are unavailable.
