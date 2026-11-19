# library.connector-blocked-count

- Status: active
- Since: unreleased
- Source: HAL-11737 (split from HAL-11681); flow-library 8.1; UX check row L10 on HAL-11613

While the app is a phone and the Library's list of kinds shows, when the connector status says one or more of the open workspace's connectors are blocked, the Connectors row's count shall add how many, after a middle dot: "2 connectors · 1 blocked". When none is blocked, when the app gives no connector status, or when the status can't be read, the row shall show only the count. The row shall follow the status when it changes.

## Examples

- Given a phone and Acme with two connectors, one of them blocked,
  when the list of kinds shows,
  then the Connectors row reads "2 connectors · 1 blocked".
- Given a phone and Acme with two connectors, none blocked,
  when the list of kinds shows,
  then the Connectors row reads "2 connectors".
- Given a phone and a connector status that can't be read,
  when the list of kinds shows,
  then the Connectors row reads only the count.
- Given a phone and the list of kinds showing "2 connectors",
  when both connectors become blocked,
  then the row reads "2 connectors · 2 blocked".
