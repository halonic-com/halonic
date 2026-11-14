# studio.workspace-connector-status

- Status: active
- Since: 0.1.0
- Source: HAL-8868 (step 5); Liam's decision on HAL-2213 (part 5)

When the desktop app opens a folder, it shall give the Library feature the folder's connectors as its connector status: each connector file's id and name, and a state taken from the file, with the engine's recent refusals for each. It shall read the files again when one changed outside the app and when the window comes to the front, and tell its listeners then, and when a refusal arrives. It shall leave out Google connectors, whose sign-in the app does not read yet. The desktop app shall register the Library feature.

## Examples

- Given Acme's `search` connector with the name "Web search",
  then the status lists it as "Web search" and connected.
- Given Acme's Google connector,
  then the status does not list it.
- Given the status view is open,
  when someone adds a connector file in another editor,
  then the view hears that something changed, and the next list holds the new connector.
- Given the engine refused a call from `search`,
  then the status gives that refusal for `search` and tells its listeners.
