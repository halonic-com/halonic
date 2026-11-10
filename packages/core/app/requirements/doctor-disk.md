# app.doctor-disk

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 (the Disk line) and FS7 (1 GiB, as the status bar)

The Disk line of `halonic doctor` shall give the free space on the drive of Halonic's data, how much space Halonic's data takes in all, and the run logs' part of it. While the free space is under 1 GiB, the line shall be marked as a warning. If the free space can't be read, then the line shall be marked as a warning. If the size of one of the data folders can't be read, then the line shall leave out how much Halonic's data takes rather than give a part of it. The line shall never be marked as failed.

## Examples

- Given 48 GB free, run logs of 1.1 GB and caches of 0.3 GB,
  then the line is ✓ with 48 GB free, 1.4 GB used and 1.1 GB of run logs.
- Given 0.8 GB free,
  then the line is ! as low on disk space.
- Given the free space can't be read,
  then the line is ! and gives no free space.
- Given the caches folder can't be read,
  then the line still gives the free space but not how much Halonic uses.
- Given the probe stopped counting the caches at its limit,
  then the line gives the total as incomplete.
