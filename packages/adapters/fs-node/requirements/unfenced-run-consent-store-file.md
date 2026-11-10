# fs-node.unfenced-run-consent-store-file

- Status: active
- Since: 0.1.0
- Source: HAL-3749; Liam's follow-up 3 on HAL-3385 (check the shape after `JSON.parse`); `UnfencedRunConsentStore` port v1

The file store of the yes to run plugin and integration code without the sandbox shall keep the yes as one JSON file, `consent.json`, in the folder it is given, which sits in the user's profile. It shall create the folder with mode `700` and the file with mode `600`, write only the yes's `reason` and `allowedAt`, and write through a temporary file and a rename. A folder that doesn't exist yet shall read as no yes. After `JSON.parse` it shall check the shape: a yes is exactly a non-empty `reason` and an `allowedAt` that is a time, both text. A file that isn't JSON or has another shape can't be read, so `get` shall throw, with neither the parser's error nor what the file holds in the error. A file that is a symbolic link, even one to nothing, a hard link, or not a plain file can't be read either; `save` shall replace the link, not write through it. `remove` shall delete the file without reading it.

## Examples

- Given a saved yes for `windows`,
  when the folder is read,
  then it holds only `consent.json`, with mode `600`, holding the reason and the time.
- Given a `consent.json` that holds `{"reason":"container","allowedAt":"soon"}`,
  when `get` is called,
  then it throws an error saying the yes can't be read, holding neither `container` nor `soon`.
- Given a `consent.json` with a field more than a reason and a time,
  when `get` is called,
  then it throws.
- Given a `consent.json` that is a link to a valid yes in a workspace,
  when `get` is called,
  then it throws, and `save` replaces the link without changing the file it pointed to.
