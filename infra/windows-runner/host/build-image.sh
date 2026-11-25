#!/usr/bin/env bash
# Builds the Windows runner's base image on the host, as root, from the merged repo files:
# installs Windows 11 Pro unattended, enables SSH and WSL, activates the licence, shuts the VM
# down, then keeps its disk as the read-only base and its NVRAM and vTPM state as the clean copy
# every job starts from (restore-vm.sh). Takes 30-60 minutes. Usage: build-image.sh
set -euo pipefail

HERE=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
ETC=/etc/halonic-win
LIB=/var/lib/halonic-win
VM=halonic-win
TPM_STATE=/var/lib/libvirt/swtpm/7b0c3c2e-5d1a-4f6e-9a79-1c2d3e4f5a10
SSH=(ssh -i "$ETC/ssh/id_ed25519" -o UserKnownHostsFile="$ETC/ssh/known_hosts"
  -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=5 halonic@10.79.0.10)
SCP=(scp -i "$ETC/ssh/id_ed25519" -o UserKnownHostsFile="$ETC/ssh/known_hosts" -o BatchMode=yes)

fail() { echo "build-image: $*" >&2; exit 1; }
log() { echo "build-image: $(date -u +%H:%M:%S) $*"; }

# wait_for <seconds> <what> <command...>: retries the command every 10 s until it succeeds.
wait_for() {
  local deadline=$((SECONDS + $1)) what=$2; shift 2
  until "$@" >/dev/null 2>&1; do
    ((SECONDS < deadline)) || fail "timed out waiting for $what"
    sleep 10
  done
}
vm_off() { [[ $(virsh domstate "$VM") == "shut off" ]]; }

# --- Preconditions: the operator's inputs, the firewall and the network.
[[ $(id -u) == 0 ]] || fail "run as root"
[[ -f $LIB/win11.iso && -f $ETC/iso.sha256 ]] || fail "missing $LIB/win11.iso or $ETC/iso.sha256"
(cd "$LIB" && sha256sum --check --status "$ETC/iso.sha256") || fail "win11.iso doesn't match $ETC/iso.sha256"
[[ $(stat -c '%U %a' "$ETC/product-key") == "root 400" ]] || fail "$ETC/product-key must be root-owned 0400"
nft list table inet halonic_win >/dev/null || fail "nft table halonic_win isn't loaded (halonic-win-nft.service)"
[[ $(virsh net-info win-net | awk '/^Active:/ {print $2}') == yes ]] || fail "network win-net isn't active"
if virsh dominfo "$VM" >/dev/null 2>&1 && ! vm_off; then fail "$VM is running; stop it first"; fi

# --- Fresh SSH key pair, admin password and known_hosts for this build.
install -d -m 0700 "$ETC/ssh"
# qemu (libvirt's own user) must reach the disk and NVRAM, so the folder is traversable, not listable.
install -d -m 0711 "$LIB"
[[ -f $ETC/ssh/id_ed25519 ]] || ssh-keygen -q -t ed25519 -N '' -C halonic-win-host -f "$ETC/ssh/id_ed25519"
rm -f "$ETC/ssh/known_hosts"
(umask 077 && openssl rand -base64 24 | tr -d '\n' >"$ETC/admin-password")

# --- Answer ISO. The password goes in with bash's own substitution, never on a command line.
WORK=$(mktemp -d /run/halonic-win-build.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
chmod 0711 "$WORK" # libvirt hands answer.iso to qemu's user on start
mkdir "$WORK/iso"
password=$(<"$ETC/admin-password")
template=$(<"$HERE/image/autounattend.xml")
printf '%s\n' "${template//@ADMIN_PASSWORD@/$password}" >"$WORK/iso/autounattend.xml"
unset password template
cp "$HERE/image/setup-1.ps1" "$HERE/image/sshd_config" "$WORK/iso/"
cp "$ETC/ssh/id_ed25519.pub" "$WORK/iso/authorized_keys"
xorriso -as mkisofs -quiet -J -r -V HALONIC_ANSWER -o "$WORK/answer.iso" "$WORK/iso"
rm -rf "$WORK/iso"

# --- A new VM: no old disk, NVRAM or vTPM state.
log "defining $VM"
if virsh dominfo "$VM" >/dev/null 2>&1; then virsh undefine "$VM" --nvram --tpm >/dev/null; fi
rm -f "$LIB/run.qcow2" "$LIB/base.qcow2" "$LIB/nvram.fd"
qemu-img create -q -f qcow2 "$LIB/run.qcow2" 150G
virsh define "$HERE/host/halonic-win.xml" >/dev/null
virsh change-media "$VM" sdb "$LIB/win11.iso" --insert --config >/dev/null
virsh change-media "$VM" sdc "$WORK/answer.iso" --insert --config >/dev/null

# The empty disk falls through to the DVD, whose UEFI loader waits for "press any key".
log "installing Windows"
virsh start "$VM" >/dev/null
for _ in $(seq 20); do virsh send-key "$VM" KEY_ENTER >/dev/null 2>&1 || true; sleep 1; done

# setup-1.ps1 restarts the VM with sshd enabled; SSH answers only after that restart.
wait_for 5400 "SSH after setup-1" "${SSH[@]}" 'if (-not (Test-Path "$env:SystemDrive\halonic-win\setup-1.done")) { exit 1 }'
log "Windows installed; SSH is up"
virsh change-media "$VM" sdb --eject --live --config >/dev/null
virsh change-media "$VM" sdc --eject --live --config >/dev/null
rm -f "$WORK/answer.iso"

log "installing WSL"
"${SCP[@]}" "$HERE/image/setup-2.ps1" "$HERE/image/activate.ps1" halonic@10.79.0.10:C:/halonic-win/
"${SSH[@]}" 'powershell -NoProfile -ExecutionPolicy Bypass -File "$env:SystemDrive\halonic-win\setup-2.ps1"'
log "activating Windows"
"${SSH[@]}" 'powershell -NoProfile -ExecutionPolicy Bypass -File "$env:SystemDrive\halonic-win\activate.ps1"' <"$ETC/product-key"

log "shutting down"
"${SSH[@]}" 'Stop-Computer -Force' || true
wait_for 600 "$VM to shut down" vm_off

# --- Keep the clean state: the base disk (read-only) and the NVRAM and vTPM it was set up with.
rm -rf "$LIB/clean"
install -d -m 0700 "$LIB/clean"
cp --preserve=all "$LIB/nvram.fd" "$LIB/clean/nvram.fd"
cp -a "$TPM_STATE" "$LIB/clean/swtpm"
mv "$LIB/run.qcow2" "$LIB/base.qcow2"
chmod 0444 "$LIB/base.qcow2"
log "done: base image $LIB/base.qcow2 ($(du -h "$LIB/base.qcow2" | cut -f1)); start a job VM with restore-vm.sh"
