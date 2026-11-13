# secrets-file.value-never-shown

- Status: active
- Since: 0.1.0
- Source: HAL-195 (PR 9a-1b); design approved by Liam on HAL-8325

The file secret store shall never put a value in an error, a log or a listing. A damaged file is reported by its location and fix, never by its content: the text a JSON parser quotes in its own error is dropped. `names()` lists names only.

## Examples

- Given a file cut off in the middle of a value `sk-live-leak`, when `get` is called, then it rejects, and neither the message, the fix nor any `cause` holds `sk-live-leak`.
- Given a file with a well-formed entry of the wrong shape that holds `sk-live-leak`, then the error doesn't hold it either.
- Given `set` fails because the folder can't be written, then the error doesn't hold the value.
- Given three stored secrets, when the names are listed, then the result has the names and no value.
