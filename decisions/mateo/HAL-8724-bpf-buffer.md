# Decision: the macOS network capture gives tcpdump a 32 MB buffer

- Task: HAL-8724 (for HAL-7050, the 0.1.0 release candidate; builds on HAL-8688)
- Approval: the task asks for this change; Liam approves this note in review on HAL-8738 and signs it
- Kind: internal

## What changes

On macOS, `capture.sh` raises the kernel's capture buffer limit (`debug.bpf_maxbufsize`) to 32 MB, then starts tcpdump with `-B 32768`. It saves the buffer settings to `bpf.txt` and, after the capture, `netstat -m` to `netstat-m.txt` with the artifacts. Linux is unchanged. The rule that fails the job when tcpdump drops a packet stays.

## Why

The limit is 512 KB by default and caps `-B`, so a burst of packets while tcpdump writes to disk dropped some, and the job failed on packets it never saw. A larger buffer removes the cause instead of loosening the rule.

## Tests

The three-system test run 43487293357 was green, with no packets dropped on macOS.

## Covers

- .github/
