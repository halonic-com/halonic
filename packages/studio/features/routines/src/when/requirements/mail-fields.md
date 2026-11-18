# routines.when.mail-fields

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 9); flow-routines 3.3 and 3.5; microcopy 12.3

When a routine starts on new mail, the When card shall show a Mailbox picker that lists the Google connectors the routine can watch (its hub's own first, then the shared ones) with each one's account, a Search field with the hint "Gmail search, for example in:inbox -from:me", and a count and unit for Check every, each written at once; picking New mail shall write the first Google connector with the search `in:inbox` checked every `2m`, and when there is no Google connector it shall write nothing and say "Add a Google connector first: a mail trigger watches its Gmail inbox."; a search that is empty shall be left out of the file and shown with "Give the search something to look for." while the file keeps the last search.

## Examples

- Given a hub with the Google connector `acme-gmail` and a routine on Manual only, then picking New mail writes `acme-gmail`, `in:inbox` and `2m`.
- Given no Google connector, then picking New mail writes nothing and the Trigger field shows "Add a Google connector first: a mail trigger watches its Gmail inbox."
- Given the search field changes to `in:inbox -from:me`, then that search is written and the mailbox and interval stay.
- Given the search field is emptied, then nothing is written and "Give the search something to look for." shows.
- Given the interval changes to 15 minutes, then `15m` is written.
