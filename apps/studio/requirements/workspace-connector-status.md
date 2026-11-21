# studio.workspace-connector-status

- Status: active
- Since: unreleased
- Source: HAL-8868 (step 5); Liam's decision on HAL-2213 (part 5)

When the desktop app opens a folder, it shall give the Library feature the folder's connectors as its connector status: each connector file's id and name, with how it connects (its transport, its account, URL or command, and the names of its secrets, never a value) and the engine's recent refusals for each. A connector other than Google shall be shown as "Not checked yet" (the file does not say whether the sign-in or secret works, so a connector is never shown as connected on a guess). It shall read the files again when one changed outside the app and when the window comes to the front, and tell its listeners then, when a Google account's setup changes, and when a refusal arrives. A Google connector's state shall be read from its account's setup record, and it is not connected while it has none. A connector file that cannot be parsed shall be listed with an error state, not left out. The desktop app shall register the Library feature.

## Examples

- Given Acme's `search` connector with the name "Web search",
  then the status lists it as "Web search" and not checked yet.
- Given a connector file that does not parse,
  then the status lists it, by its file name, as unreadable, with a sentence that says so.
- Given Acme's Google connector and a setup record that has signed in,
  then the status lists it as connected.
- Given Acme's Google connector with no setup record,
  then the status lists it as not connected.
- Given the status view is open,
  when someone adds a connector file in another editor,
  then the view hears that something changed, and the next list holds the new connector.
- Given the status view is open,
  when a Google account's setup changes,
  then the view hears that something changed.
- Given the engine refused a call from `search`,
  then the status gives that refusal for `search` and tells its listeners.
- Given an agent's Try it chat whose turn refused a call from `search`,
  then the status gives that refusal for `search`.
- Given a run whose turn left the `lookup` tool of `mail` waiting for an approval,
  then the status gives `lookup` as waiting for `mail`.
- Given that run, when a person approves `lookup` of `mail` in the Library,
  then the status no longer gives `lookup` as waiting for `mail`.
