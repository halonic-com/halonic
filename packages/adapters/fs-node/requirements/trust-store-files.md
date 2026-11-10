# fs-node.trust-store-files

- Status: active
- Since: 0.1.0
- Source: HAL-1931; HAL-188 build item 5; HAL-2978; HAL-2985; `TrustStore` port v1

The file trust store shall keep each trust record as one JSON file in the folder it is given, named by the lower-case hex SHA-256 of the record's location as UTF-16 code units (little-endian) and `.json`, with the location as the file's first key. It shall create the folder with mode `700` and each file with mode `600`, and write a record through a temporary file and a rename. A folder that doesn't exist yet shall read as empty. `list` shall read only record files and leave other files in the folder alone. When a record can't be read, `get` shall throw naming the location; `list` shall throw naming the location when the file's first key holds the location it is named for, and naming the file otherwise. A record file that is a symbolic link, even one to nothing, a hard link (a file with more than one name), or not a plain file, such as a named pipe, can't be read, so `get` and `list` shall throw for it as for a damaged record, without waiting on a named pipe; a grant shall replace the link, not write through it. `revoke` shall delete the file without reading it.

## Examples

- Given a grant for `/Workspaces/Café`,
  when the folder is read,
  then it holds one file named by the SHA-256 of `/Workspaces/Café`, starting with `"location": "/Workspaces/Café"`.
- Given grants for `/a\uD800` and `/a\uD801` (two different lone surrogates),
  when the folder is read,
  then it holds two files, and each location reads its own record.
- Given a record file that holds only `{`,
  when `list()` is called,
  then it throws naming the file, and `revoke` of its location deletes it.
- Given the record for `/workspaces/acme` copied over the file for `/workspaces/zeta`,
  when `get("/workspaces/zeta")` is called,
  then it throws naming `/workspaces/zeta`, and `/workspaces/acme` still reads.
- Given a `notes.txt` and a leftover `.tmp` file in the folder,
  when `list()` is called,
  then they are not listed and `notes.txt` is unchanged.
- Given the record file for `/workspaces/acme` is a link to a valid record outside the folder,
  when `get("/workspaces/acme")` and `list()` are called,
  then they throw naming the location and the file, and a grant replaces the link without changing the file it pointed to.
- Given the record file for `/workspaces/acme` is a named pipe or a hard link to a file outside the folder,
  when `get("/workspaces/acme")` and `list()` are called,
  then they throw at once, naming the location and the file.
