# library.new-collection

- Status: active
- Since: unreleased
- Source: HAL-1303 (T10, P7d); flow-library 3.2 (New collection); microcopy 11.2

When a person presses **New collection** on the Collections tab, the Library shall open a dialog with Name, and under Name the collection's file ("File: library/collections/claims.collection.yaml"), which follows the name and shows the collections folder alone while Name is empty. If **Create** is pressed with Name empty, then the dialog shall show "Give it a name.", make nothing and focus Name. Otherwise it shall make the collection through the new-collection host as one change and hand its reference on, so the caller opens its page. If making it fails, then the dialog shall stay open with what was typed and show "Couldn't create the collection: *reason*." with **Try again**.

## Examples

- Given Name "Claims",
  when the name is typed,
  then the line under it reads "File: library/collections/claims.collection.yaml".
- Given Name empty,
  when Create is pressed,
  then "Give it a name." shows and nothing is made.
- Given the host rejects with "The disk is full.",
  when Create is pressed,
  then the dialog shows "Couldn't create the collection: The disk is full."
