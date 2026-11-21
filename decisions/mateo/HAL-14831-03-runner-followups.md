# Decision: the CI runner setup takes Julian's follow-ups from the C1–C6 check

- Task: HAL-14831 (Julian's check of #4402 against C1–C6, HAL-15027, 21 Nov: approved, with follow-ups)
- Approval: Julian asked for the firewall fix before merge groups move; Liam signs this note in review, then Julian checks it as a security PR
- Kind: internal

## What changes

- `host/halonic-ci-nft.service` loses its `ExecStop`. Stopping or restarting the unit used to delete
  the `inet halonic_ci` table and leave the running VM unfiltered (stopping libvirtd doesn't stop QEMU).
  `nft -f` already swaps the table atomically, and a failed load keeps the old one.
- The slot script reads the job's event file inside the container (`docker exec … cat`), not as root
  on the VM through the work dir, where the job could replace it with a symlink to any VM file.
- The slot script fails closed when the App key isn't root `0400` or `dockremap` has no range in
  `/etc/subuid` (before, an empty base silently became uid 1001).
- README: the status files are untrusted text, firewall restarts keep the rules, Timothy's weekly
  audit-log check (C6), `SMOKE_BRANCH` only on an admin-only branch, and the partial disk cap (C5)
  listed as not built yet.

## Why

Each closes a gap Julian found. The firewall one is due before merge groups move to the server.

## Tests

`infra/ci-runner/hook.test.mjs` checks that the unit has no `ExecStop` and still is required by
libvirtd, and that the slot script checks the key and the remap range and reads the event file only
inside the container. 14 tests pass.

## Deploy

After merge, the board supervisor copies the unit and the slot script to the host and the VM,
runs `systemctl daemon-reload` on both, and restarts the slots in the next quiet moment.
