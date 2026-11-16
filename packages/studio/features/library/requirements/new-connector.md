# library.new-connector

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P8a, P8b); flow-library 3.3; microcopy 11.2

When a person presses **New connector** on the Connectors tab, the Library shall open a dialog with Name, Hub (only with more than one hub), **How it connects** with the ways the new-connector host offers (Gmail and Google Drive with Account, MCP server over HTTP with URL, Local program with Command), an optional Secret for the two program ways, and under Name the connector's file ("File: hubs/acme/library/connectors/notes.connector.yaml"), which follows the name and shows the connectors folder alone while Name is empty. Once a way is picked, the dialog shall show the fixed line on what Create writes above the buttons: "Every tool this connector offers will ask a person first. You can change that in its file." for the two MCP ways and "Tools that change or send something ask a person first. Reading and searching don't. You can change that in its file." for Google. If **Create** is pressed with a field wrong, then the dialog shall show what is wrong under it ("Give it a name.", "Choose how it connects.", "Enter the account's email address, like fin@acme.example.", "Enter a full address, like https://mcp.example.com.", "Enter the command that starts the server.", "Use letters, numbers and underscores, like NOTES_TOKEN."), make nothing and focus the first wrong field. Otherwise it shall make the connector through the new-connector host as one change, without connecting or starting anything, and hand its reference on, so the caller opens its page with the connector's name focused. If making it fails, then the dialog shall stay open with what was typed and show "Couldn't create the connector: *reason*." with **Try again**.

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
