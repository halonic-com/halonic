# library.library-phone

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (P9c); flow-library 8

While the app is a phone, the Library feature shall not offer New connector, on the Connectors tab or from a run banner's request: connectors are looked at there, and set up on a larger screen. While the app is a phone, Knowledge and Connectors rows and pages shall not offer Delete either, because a phone can't remove what it can't make again; only skill and collection rows and pages keep it (flow-library 8.1, phone layout 1.1).

## Examples

- Given a phone and a host that can make connectors,
  when the Connectors tab shows,
  then there is no New connector button.
- Given a desktop,
  when the Connectors tab shows,
  then New connector shows.
- Given a phone,
  when a run banner requests a new connector,
  then the Connectors tab shows and no dialog opens.
- Given a phone and the Knowledge or Connectors tab,
  when its rows show,
  then each row's ⋮ menu has Open and Open in new tab, and no Delete.
- Given a phone and the Skills tab,
  when its rows show,
  then each row's ⋮ menu also has Delete.
- Given a phone and a Knowledge or Connectors page,
  when it shows,
  then it has no ⋮ menu, as it holds no entry.
- Given a phone and a skill or collection page,
  when it shows,
  then its ⋮ menu has Delete.
