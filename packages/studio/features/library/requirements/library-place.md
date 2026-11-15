# library.library-place

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P4b); flow-library 3.1; req-library

The Library feature shall add the Library place, which shows the Library page over the open workspace's items. The place shall open on the tab the workspace was last on, and on Skills the first time. Alt+4, Alt+5, Alt+6 and Alt+7 shall open the Library on Skills, Knowledge, Collections and Connectors, whether or not the Library was drawn yet. The place shall remember the tab it shows for the workspace. A row shall open the item under its hub, and a row of what the workspace shares shall open under the one name the tab key uses for the workspace itself.

## Examples

- Given a workspace that was last on Collections,
  when the Library opens,
  then the Collections tab shows.
- Given a workspace that was never on the Library,
  when the Library opens,
  then the Skills tab shows.
- Given the Library is not drawn,
  when the user presses Alt+7,
  then the Library opens on Connectors.
- Given the user selects Knowledge,
  when the workspace's memory is read,
  then it says Knowledge.
- Given a skill `refunds` in the hub `acme`,
  when its row is clicked,
  then the item `skill/acme/refunds` opens.
