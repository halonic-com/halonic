# Windows runner VM (our own server)

A Windows 11 Pro VM on the server's KVM host, to run the Windows real-PC check (HAL-10975) as a
GitHub Actions job. The board chose it on HAL-16310 (option C) after the HAL-17807 trial showed
WSL 2 running in a Windows 11 VM there. Plan and review: HAL-18572.

This folder is the setup the board's server session deploys after the pull request merges; the
server doesn't pull from the repo. This first part builds the image, the VM and its network. The
runner registration (an ephemeral just-in-time runner per job, a fresh VM per job and the
admission hook) follows in a second pull request. Until then nothing registers a runner here.

## Isolation

- **A fresh VM for every boot.** `host/build-image.sh` builds the image once and keeps its disk as
  the read-only `base.qcow2`. `host/restore-vm.sh` gives the next boot an empty overlay on it,
  plus the NVRAM and vTPM state saved at the end of the build. Nothing a job writes reaches the next one.
- **Network.** NAT network `win-net` (`host/win-net.xml`, bridge `virbr-win`, 10.79.0.0/24) with
  no DHCP and no DNS on the bridge: the VM has the static address 10.79.0.10 and uses 1.1.1.1
  (answer file), so it never needs the host. The nft table `inet halonic_win`
  (`host/halonic-win.nft`) lets the VM reach only TCP 80/443, DNS on 1.1.1.1 / 1.0.0.1 and NTP.
  It drops traffic to the host (libvirt's dnsmasq included), the server's public /24, the Linux CI
  VM (10.77.0.0/24), private, CGNAT and link-local ranges, IPv6, and anything from another source
  address. Like `infra/ci-runner`'s table, its unit is required by `libvirtd`, so no rules means
  no VM.
- **SSH in, from the host only.** sshd in the VM takes only the host's key
  (`/etc/halonic-win/ssh/id_ed25519`), no passwords and no forwarding, and Windows' firewall admits
  it only from 10.79.0.1. The local account `halonic` (an administrator) has a random password
  kept in `/etc/halonic-win/admin-password` for the console.
- **No Paperclip secrets in the VM.** It holds the Windows licence and, from the second pull
  request, one job's just-in-time runner config.
- **Known, accepted risk (Liam, HAL-18572; Julian confirms in the isolation review):** Windows
  keeps its product key, and a job running as administrator can read it back. Only reviewed code
  from `main` will run here, and the worst case is a retail key we replace.

## The VM

`host/halonic-win.xml`: 8 vCPU (`host-passthrough`, one socket, Hyper-V enlightenments), 16 GB,
a 150 GB qcow2 on SATA, UEFI with Secure Boot, a TPM 2.0 (swtpm) and an e1000e NIC. SATA and
e1000e need no virtio driver ISO. The SMBIOS UUID and the MAC address are pinned: both count
toward Windows' activation hardware ID, so a rebuilt VM keeps its licence.

The image (`image/`): `autounattend.xml` installs Windows 11 Pro. The trial stopped at the country
screen because its first-run part had no `International-Core`; this file names the locales in
every pass and hides every OOBE page. `setup-1.ps1` runs at the first sign-in: it turns on SSH,
turns off automatic Windows Update, enables `Microsoft-Windows-Subsystem-Linux` and
`VirtualMachinePlatform` with dism, and restarts. `setup-2.ps1` runs over SSH: it installs the WSL
MSI from a pinned release URL, checked against its SHA-256 (`wsl --install` over SSH reaches
only a stub, and `api.github.com` answers 403 to the server's IP). `activate.ps1` installs the
licence key, which the host sends on stdin.

## Build (board's server session)

As root on the host, from a checkout of `main` (`cd` into it first; every path below is relative
to the repo root unless it starts with `/`).

1. **Room on the host.** The VM must not starve the Linux CI VM. With `halonic-ci` running, check
   `nproc`, `virsh dominfo halonic-ci | grep -E 'CPU\(s\)|memory'` and `free -g`. Go on only if
   the host has at least 8 logical CPUs on top of `halonic-ci`'s vCPUs plus 4 for the host itself,
   and `available` memory is at least 24 GB (16 GB for this VM, 8 GB to spare). Otherwise stop and
   say so on HAL-18572.
2. **Packages:** `apt-get install --no-install-recommends swtpm swtpm-tools ovmf xorriso`
   (qemu, libvirt and nft are already there for `halonic-ci`).
3. **Firewall first.** `/etc/halonic-ci/site.nft` (the server's public /24) is shared with
   `infra/ci-runner` and must exist.

   ```sh
   install -d -m 0700 /etc/halonic-win
   install -m 0644 infra/windows-runner/host/halonic-win.nft /etc/halonic-win/halonic-win.nft
   install -m 0644 infra/windows-runner/host/halonic-win-nft.service /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now halonic-win-nft.service
   nft list table inet halonic_win >/dev/null && echo rules loaded
   ```

4. **Network:**
   `virsh net-define infra/windows-runner/host/win-net.xml && virsh net-autostart win-net && virsh net-start win-net`
5. **The ISO.** Download the Windows 11 (multi-edition) ISO, English (United States), x64, from
   Microsoft's download page to `/var/lib/halonic-win/win11.iso`, and write the SHA-256 that page
   lists for it: `echo '<sha256>  win11.iso' > /etc/halonic-win/iso.sha256`. Create
   `/var/lib/halonic-win` with `install -d -m 0711 /var/lib/halonic-win` first.
6. **The licence key**, bought by the board (Windows 11 Pro, retail): from the host's secret
   store into `/etc/halonic-win/product-key` with
   `install -m 0400 -o root -g root /dev/stdin /etc/halonic-win/product-key` (paste, then
   Ctrl-D). Never in the repo, a command line or a backup that leaves the host.
7. **Build:** `infra/windows-runner/host/build-image.sh`. It checks all of the above, installs
   Windows (watch it with a VNC client through `ssh -L 5979:127.0.0.1:5979` to the host), then
   prints `done: base image …`. It fails with the reason if a step does. The licence line in its
   output must say `status 1`.
8. **Check a clean boot:** `infra/windows-runner/host/restore-vm.sh --start`, then after a minute or so:

   ```sh
   ssh -i /etc/halonic-win/ssh/id_ed25519 -o UserKnownHostsFile=/etc/halonic-win/ssh/known_hosts \
     halonic@10.79.0.10 'wsl --version; wsl --status; Test-NetConnection 1.1.1.1 -Port 443 | Select TcpTestSucceeded'
   ```

   `wsl --version` should show WSL 3.0.5 and a kernel. Then check the isolation from the VM:
   `Test-NetConnection 10.77.0.1 -Port 22` and `Test-NetConnection 10.79.0.1 -Port 22` must both
   fail. Then `virsh shutdown halonic-win`.

## Restore

`infra/windows-runner/host/restore-vm.sh` (add `--start` to boot it). It stops the VM if it runs,
puts a new empty overlay on `base.qcow2`, and copies back the NVRAM and vTPM state from
`/var/lib/halonic-win/clean/`. Use it after any boot you don't trust; the runner (second pull
request) runs it before every job.

## Rebuild (monthly, or for a critical Windows CVE)

Automatic updates are off, so the base image only gets patches through a rebuild. Run
`infra/windows-runner/host/build-image.sh` again on the first working day of each month, and the
same day Microsoft fixes a critical Windows CVE. It replaces the base image, NVRAM and vTPM state.
The pinned UUID and MAC keep the activation. To move to a newer WSL, change `$wslVersion` and
`$wslSha256` in `image/setup-2.ps1` in a pull request first.

## Teardown

```sh
virsh destroy halonic-win; virsh undefine halonic-win --nvram --tpm
virsh net-destroy win-net; virsh net-undefine win-net
systemctl disable --now halonic-win-nft.service && nft delete table inet halonic_win
rm /etc/systemd/system/halonic-win-nft.service && systemctl daemon-reload
rm -rf /var/lib/halonic-win /etc/halonic-win/ssh /etc/halonic-win/admin-password
```

Keep `/etc/halonic-win/product-key` (the licence moves to a rebuilt VM) unless the licence is
being retired too.
