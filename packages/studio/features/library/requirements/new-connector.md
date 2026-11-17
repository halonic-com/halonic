# library.new-connector

- Status: active
- Since: unreleased
- Source: HAL-1303 (T10, P8a, P8d), HAL-9823; flow-library 3.3; microcopy 11.2

When a person presses **New connector** on the Connectors tab, the Library shall open a dialog with Name, Hub (only with more than one hub), **How it connects** with the ways the new-connector host offers (Gmail and Google Drive with Account, MCP server over HTTP with URL, Local program with Command), an optional Secret for the two program ways, and under Name the connector's file ("File: hubs/acme/library/connectors/notes.connector.yaml"), which follows the name and shows the connectors folder alone while Name is empty. Once a way is picked, the dialog shall show the fixed line on what Create writes above the buttons: "Every tool this connector offers will ask a person first. You can change that in its file." for the two MCP ways and "Tools that change or send something ask a person first. Reading and searching don't. You can change that in its file." for Google. If **Create** is pressed with a field wrong, then the dialog shall show what is wrong under it ("Give it a name.", "Choose how it connects.", "Enter the account's email address, like fin@acme.example.", "Enter a full address, like https://mcp.example.com.", "Enter the command that starts the server.", "Use letters, numbers and underscores, like NOTES_TOKEN."), make nothing and focus the first wrong field. Otherwise it shall make the connector through the new-connector host as one change, without connecting or starting anything, and hand its reference on, so the caller opens its page. If making it fails, then the dialog shall stay open with what was typed and show "Couldn't create the connector: *reason*." with **Try again**.

When the run banner asks for a connector it names (`requestNewConnector`), the Library shall show the Connectors tab and open this dialog with the name filled in and, when the request knows how it connects, that way picked. It shall guess nothing: a request with no way, or with a way the host does not offer, leaves the way unpicked. A later request while the dialog is open replaces it: the dialog shows the newest request's name and way. The request waits until the Library is drawn and goes to one Library only.

The Library shall also offer **New connector** as an action in the command palette (Ctrl K, and search on a phone). Running it shows the Library's Connectors tab and opens this dialog with nothing filled in, as the Inbox's **Go to the secret field** does. Where there is no new-connector host, as on a phone, it opens the Library and no dialog.

## Examples

- Given Name "Notes" and no way picked,
  when Create is pressed,
  then "Choose how it connects." shows and nothing is made.
- Given the way "MCP server over HTTP" and the URL "notes",
  when Create is pressed,
  then "Enter a full address, like https://mcp.example.com." shows and nothing is made.
- Given the way "Local program (stdio)" and the secret "NOTES_TOKEN",
  when the secret is typed,
  then the hint reads "Passed to the program as NOTES_TOKEN. Its value stays on this computer."
- Given the host rejects with "The disk is full.",
  when Create is pressed,
  then the dialog shows "Couldn't create the connector: The disk is full."
- Given the run banner asks for the connector "drive" with the way Gmail and Google Drive,
  when the Library is shown,
  then it shows the Connectors tab and New connector with "drive" as the name and that way picked.
- Given the run banner asks for the connector "notes" and names no way,
  when the Library is shown,
  then New connector opens with "notes" as the name and no way picked.
- Given the command palette,
  when the action "New connector" is run,
  then the Library shows the Connectors tab and New connector opens with no name and no way picked.
- Given no new-connector host, as on a phone,
  when the action "New connector" is run,
  then the Library opens and no dialog shows.
