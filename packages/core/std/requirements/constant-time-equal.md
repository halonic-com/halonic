# std.constant-time-equal

- Status: active
- Since: 0.1.0
- Source: the old app's timing-safe password compare, a protection that must survive the rewrite

The constant-time compare shall read every byte of two equal-length arrays before it answers, so the time it takes doesn't depend on where they differ.

If the two arrays have different lengths, then the compare shall return false.

## Examples

- Given `01 02 03` and `01 02 03`, when they are compared, then the result is true.
- Given `01 02 09` and `01 02 03`, when they are compared, then the result is false.
- Given `01 02` and `01 02 03`, when they are compared, then the result is false.
- Given two 4-byte arrays that differ in the first byte, when they are compared, then all 4 bytes of the first array are read.
