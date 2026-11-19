# app.doctor-time-limit

- Status: active
- Since: 0.1.0
- Source: HAL-13405; first-run-progress 7 (each check has its own 5-second limit), sized on HAL-8005

While `halonic doctor` runs, the doctor service shall give each check 5 seconds, and when a check hasn't answered by then, its line shall be a warning that it didn't answer in time, and the other lines shall still be returned. A check that runs over shall never make `doctor` exit 1. When the resource report runs over, the Disk line shall time out, and the Models line only when a provider runs on this computer. The 5 seconds are a target until they have been measured on a slow computer.

## Examples

- Given a harness's `detect()` never answers,
  then after 5 seconds the Harnesses line is ! as timed out, the Sandbox and Disk lines are as found, and `doctor` exits 0.
- Given the sandbox check never answers and the disk has plenty of space,
  then the Sandbox line is ! as timed out and the summary counts one warning.
- Given the resource report never answers and the workspace uses only Anthropic, whose key is stored,
  then the Disk line is ! as timed out and the Models line is ✓.
- Given a check answers in time,
  then its timer is cleared, so nothing is left waiting.
