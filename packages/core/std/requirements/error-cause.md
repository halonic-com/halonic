# std.error-cause

- Status: active
- Since: unreleased
- Source: HAL-12343

The cause finder shall give the first error, starting with the error itself and following each error's `cause`, that is an instance of the asked type, and shall give nothing when no error in the chain is. It shall stop at a value that isn't an error and at an error it has already seen, so a chain that loops back on itself ends.

## Examples

- Given an error whose cause's cause has the asked type, when its cause is looked for, then that error is found.
- Given an error with a text as its cause, when a cause of a type is looked for, then nothing is found.
- Given two errors that are each other's cause, when a cause of another type is looked for, then nothing is found and the search ends.
