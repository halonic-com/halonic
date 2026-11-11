#!/usr/bin/env bash
# Linux only. Installs bubblewrap and socat, then checks that bubblewrap can
# create a user namespace. Ubuntu 24.04 restricts unprivileged user
# namespaces through AppArmor; if bubblewrap fails, this lifts that
# restriction for the runner and checks again. Prints both results.
set -u
sudo apt-get update -qq >/dev/null
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq bubblewrap socat >/dev/null
echo "### Linux: $(bwrap --version), $(socat -V | grep -m1 'socat version' | cut -d' ' -f1-3)"
check() { bwrap --unshare-user --ro-bind / / true 2>&1 && echo "bwrap user namespace: works" || echo "bwrap user namespace: fails"; }
echo "kernel.apparmor_restrict_unprivileged_userns=$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo unset)"
result="$(check)"; echo "$result"
if [[ "$result" == *fails ]]; then
  sudo sysctl -q -w kernel.apparmor_restrict_unprivileged_userns=0
  echo "set kernel.apparmor_restrict_unprivileged_userns=0"
  check
fi
