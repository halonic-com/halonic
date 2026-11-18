# app.collection-text

- Status: active
- Since: unreleased
- Source: HAL-1303, P7f; flow-library 5.3 header (the name as a rename field), checklist 3.4

When the collection page shows or renames a collection, `readCollectionName` shall return the name in the collection file, and `renameCollectionText` shall return the file's text with only the name changed. The id, the fields, the views, the seed records and the comments shall keep their values and order. A name that is given unchanged (after trimming) shall leave the text exactly as it was, so a rename field left without editing writes nothing. If the new name is empty after trimming, then it shall return `name_missing` and no text, so the caller keeps the old one. If the file is not valid YAML or not a map, then it shall return `unreadable`.

## Examples

- Given `name: Claims # shown in the list`, when the name changes to "Open claims", then the comment stays.
- Given a collection, when its own name is given again, then the text is the one it was.
- Given a collection, when the name is changed to spaces, then the error is `name_missing`.
- Given a file that is a list, then the error is `unreadable`.
- Given a file without a `name`, then the name reads as empty and a rename adds it.
