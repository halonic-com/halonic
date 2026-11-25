#!/usr/bin/env bash
# Puts the Windows runner VM back in its clean state, as root: a new empty overlay on the
# read-only base disk, and the NVRAM and vTPM state saved by build-image.sh (not a blank TPM:
# Windows was set up and activated against that one). Nothing the last boot wrote survives.
# Usage: restore-vm.sh [--start]
set -euo pipefail

LIB=/var/lib/halonic-win
VM=halonic-win
TPM_STATE=/var/lib/libvirt/swtpm/7b0c3c2e-5d1a-4f6e-9a79-1c2d3e4f5a10

fail() { echo "restore-vm: $*" >&2; exit 1; }

[[ $# == 0 || ($# == 1 && $1 == --start) ]] || fail "usage: restore-vm.sh [--start]"
[[ $(id -u) == 0 ]] || fail "run as root"
[[ -f $LIB/base.qcow2 && -f $LIB/clean/nvram.fd && -d $LIB/clean/swtpm ]] ||
  fail "no clean image in $LIB; run build-image.sh first"
virsh dominfo "$VM" >/dev/null || fail "$VM isn't defined; run build-image.sh first"
if [[ $(virsh domstate "$VM") != "shut off" ]]; then virsh destroy "$VM" >/dev/null; fi

rm -f "$LIB/run.qcow2"
qemu-img create -q -f qcow2 -F qcow2 -b "$LIB/base.qcow2" "$LIB/run.qcow2"
cp --preserve=all "$LIB/clean/nvram.fd" "$LIB/nvram.fd"
rm -rf "$TPM_STATE"
cp -a "$LIB/clean/swtpm" "$TPM_STATE"

if [[ ${1:-} == --start ]]; then virsh start "$VM" >/dev/null; fi
echo "restore-vm: $VM is clean${1:+ and started}"
