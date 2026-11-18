# library.connector-tools-line

- Status: active
- Since: 0.1.0
- Source: HAL-11681; microcopy 11.4 (`library.connectors.tools-line`); Liam's review of #3329 (HAL-11625)

The Library feature shall show, on the page of a connector whose file says every tool asks first, one plain sentence under its name: "Agents get the tools you approve from the ones the server lists. A person approves each call to every tool." Under that sentence it shall offer a quiet link, "Change which tools agents get in the file.", that opens the connector's file in a tab. While the app is a phone, it shall show the sentence but not the link, because a phone has no tabs to open the file in. A connector whose file says it asks first for changes only (Gmail and Google Drive) shall show its own sentence and no link. A connector whose file says nothing about asking first shall show neither.

## Examples

- Given a connector whose file says every tool asks first,
  when its page shows on a desktop,
  then it shows the sentence and the link, and the link opens the connector's file.
- Given the same connector on a phone,
  when its page shows,
  then it shows the sentence and no link.
- Given a Gmail and Google Drive connector that asks first for changes,
  when its page shows,
  then it shows its own sentence and no link.
- Given a connector whose file says nothing about asking first,
  when its page shows,
  then it shows no sentence about asking first and no link.
