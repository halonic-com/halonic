# routines.when.mail-fields

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 9), HAL-15340, HAL-15338; flow-routines 3.3 and 3.5; microcopy 12.3

When a routine starts on new mail, the When card shall show a Mailbox picker that lists the Google connectors the routine can watch (its hub's own first, then the shared ones) with each one's account, a Search field with the hint "Gmail search, for example in:inbox -from:me", and a count and unit for Check every, each written at once; a search that is empty shall be left out of the file and shown with "Give the search something to look for." while the file keeps the last search. While Halonic checks no mail (rule N5b, HAL-15340), the Trigger picker shall offer New mail only to a routine already on it, shown as the kind it is, and to no other routine.

## Examples

- Given a routine on Manual only, then the Trigger picker offers Manual only, On a schedule, Every … and On a signal, and no New mail.
- Given a routine on New mail in `acme-gmail`, then the Trigger picker shows New mail, the Mailbox picker and "Halonic doesn't check mail yet, so this routine starts only with Run now."
- Given a routine on New mail, then picking New mail writes nothing, and picking Every … writes `1h`.
- Given a routine on New mail in `gone`, a connector the workspace doesn't offer, and no Google connector, then the Mailbox picker keeps `gone` and the card has no **Add a Google connector**.
- Given the search field changes to `in:inbox -from:me`, then that search is written and the mailbox and interval stay.
- Given the search field is emptied, then nothing is written and "Give the search something to look for." shows.
- Given the interval changes to 15 minutes, then `15m` is written.
