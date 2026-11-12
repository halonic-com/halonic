#!/usr/bin/env bash
# Captures every packet of a CLI session with tcpdump, from the session's
# start through IDLE_MINUTES idle to a control fetch of example.com at the
# end, and writes a report. Needs passwordless sudo.
#
# Linux: the session runs in a network namespace of its own, with a route
# out to the internet and no IPv6. tcpdump listens on all of the namespace's
# interfaces, so it sees the session's packets and nothing of the runner's:
# any packet that isn't loopback or the control's fails the job.
# macOS: tcpdump listens on all interfaces, and its packet metadata names the
# process. The session runs in a process group of its own, and `ps` samples
# record its processes all through the capture. Packets of those processes
# that aren't loopback fail the job; see report.mjs for the rest.
#
# The job also fails when the control isn't in the capture, when tcpdump
# stopped early or dropped packets, when the session left processes running,
# or when any step fails. The report is written in every case.
#
# Usage: capture.sh <artifacts folder>. IDLE_MINUTES (0 to 30, default 10) is
# how long it keeps listening after the session.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
artifacts="$1"
scratch="${RUNNER_TEMP:-/tmp}/network-capture"
idle="${IDLE_MINUTES:-10}"
if ! [[ "$idle" =~ ^[0-9]{1,2}$ ]] || ((10#$idle > 30)); then
  echo "IDLE_MINUTES must be a whole number of minutes from 0 to 30, not $idle." >&2
  exit 2
fi
idle=$((10#$idle))
user="$(id -un)"
os="$(uname -s)"
mkdir -p "$artifacts" "$scratch"
export HALONIC_CLI="$repo/apps/cli/src/main.ts"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
if [ "$os" = Linux ]; then ext=pcap; else ext=pcapng; fi
capture="$artifacts/capture.$ext"

ns=halonic-capture
in_ns() { sudo ip netns exec "$ns" sudo -u "$user" env "PATH=$PATH" "HALONIC_CLI=$HALONIC_CLI" "$@"; }
status=0
fail() {
  echo "- $*" | tee -a "$artifacts/problems.md" >&2
  status=1
}

uplink=""
linux_network() {
  sudo ip netns add "$ns"
  sudo ip link add hc-host type veth peer name hc-ns
  # No IPv6 on either end of the link: the router and neighbour messages each
  # end sends when it comes up would show up as traffic. Every host name is
  # still looked up over IPv4 first.
  sudo sysctl -qw net.ipv6.conf.hc-host.disable_ipv6=1 net.ipv6.conf.hc-ns.disable_ipv6=1
  sudo ip link set hc-ns netns "$ns"
  sudo ip netns exec "$ns" sysctl -qw net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1 net.ipv6.conf.hc-ns.disable_ipv6=1
  sudo ip addr add 10.203.0.1/30 dev hc-host
  sudo ip link set hc-host up
  sudo ip netns exec "$ns" ip addr add 10.203.0.2/30 dev hc-ns
  sudo ip netns exec "$ns" ip link set hc-ns up
  sudo ip netns exec "$ns" ip link set lo up
  sudo ip netns exec "$ns" ip route add default via 10.203.0.1
  sudo sysctl -qw net.ipv4.ip_forward=1
  uplink="$(ip route show default | awk '{print $5; exit}')"
  sudo iptables -t nat -A POSTROUTING -s 10.203.0.0/30 -o "$uplink" -j MASQUERADE
  sudo iptables -I FORWARD -i hc-host -j ACCEPT
  sudo iptables -I FORWARD -o hc-host -j ACCEPT
  # The host's resolver listens on its own 127.0.0.53, which the namespace
  # can't reach; give the namespace the real upstream servers.
  sudo mkdir -p "/etc/netns/$ns"
  grep '^nameserver' /run/systemd/resolve/resolv.conf | sudo tee "/etc/netns/$ns/resolv.conf" >/dev/null
}
linux_network_down() {
  sudo ip netns del "$ns" 2>/dev/null || true
  sudo ip link del hc-host 2>/dev/null || true
  if [ -n "$uplink" ]; then
    sudo iptables -t nat -D POSTROUTING -s 10.203.0.0/30 -o "$uplink" -j MASQUERADE 2>/dev/null || true
  fi
  sudo iptables -D FORWARD -i hc-host -j ACCEPT 2>/dev/null || true
  sudo iptables -D FORWARD -o hc-host -j ACCEPT 2>/dev/null || true
  sudo rm -rf "/etc/netns/$ns"
}

tcpdump_pid=""
# tcpdump in the background; returns once it listens.
start_capture() {
  if [ "$os" = Linux ]; then
    sudo ip netns exec "$ns" tcpdump -i any -nn -U -Z root -w "$capture" 2>"$capture.log" &
  else
    sudo tcpdump -i any -nn -U -w "$capture" 2>"$capture.log" &
  fi
  tcpdump_pid=$!
  for _ in $(seq 50); do grep -q 'listening on' "$capture.log" 2>/dev/null && return; sleep 0.2; done
  cat "$capture.log" >&2
  return 1
}
# Stops tcpdump, which must still be running, and checks it dropped nothing.
stop_capture() {
  [ -n "$tcpdump_pid" ] || return 0
  pgrep -x tcpdump >/dev/null || fail "tcpdump stopped before the end of the capture."
  sudo pkill -INT -x tcpdump
  wait "$tcpdump_pid" || fail "tcpdump exited with code $?."
  tcpdump_pid=""
  local dropped
  dropped="$(sed -nE 's/^([0-9]+) packets? dropped by kernel$/\1/p' "$capture.log")"
  [ "$dropped" = 0 ] || fail "tcpdump dropped ${dropped:-an unknown number of} packets (see capture.$ext.log)."
  sudo chown "$user" "$capture"
}

# macOS: every process's pid, parent and group, every 0.1 s, without repeats.
sampler_pid=""
start_sampler() {
  rm -f "$scratch/sampler.stop"
  while [ ! -e "$scratch/sampler.stop" ]; do
    ps -axo pid=,ppid=,pgid=,comm=
    sleep 0.1
  done | awk '!seen[$0]++ { print; fflush() }' >"$artifacts/processes.txt" &
  sampler_pid=$!
}
stop_sampler() {
  [ -n "$sampler_pid" ] || return 0
  touch "$scratch/sampler.stop"
  wait "$sampler_pid" || true
  sampler_pid=""
}

root=""
write_report() {
  [ -s "$capture" ] || {
    fail "There is no capture."
    return
  }
  local show=(-r "$capture" -nn -tttt)
  [ "$os" = Darwin ] && show+=(-k)
  if ! TZ=UTC tcpdump "${show[@]}" >"$capture.txt" 2>"$capture.read.log"; then
    fail "tcpdump couldn't read the capture: $(tail -n 1 "$capture.read.log")"
    return
  fi
  local args=("Session on $os ($(uname -m))" "$artifacts/control.json")
  [ "$os" = Darwin ] && args+=("$artifacts/processes.txt" "$root")
  node "$here/report.mjs" "${args[@]}" <"$capture.txt" >"$artifacts/report.md" ||
    fail "The report found traffic from the session or a problem with the control (see above)."
}

# Runs on every exit, so a failed step still stops tcpdump, removes the
# namespace and writes the report.
finish() {
  local code=$?
  trap - EXIT
  set +e
  [ "$code" -eq 0 ] || fail "capture.sh stopped early with exit code $code."
  stop_capture
  stop_sampler
  [ "$os" = Linux ] && linux_network_down
  write_report
  for file in report.md leftovers.txt problems.md; do
    [ -s "$artifacts/$file" ] && cat "$artifacts/$file" >>"$summary"
  done
  exit "$status"
}
trap finish EXIT

[ "$os" = Linux ] && linux_network
echo "Capturing the session, $idle minutes idle and the control."
start_capture
if [ "$os" = Linux ]; then
  in_ns bash "$here/session.sh" "$scratch/session" >"$artifacts/session.log" 2>&1 ||
    fail "session.sh exited with code $?."
else
  start_sampler
  # A process group of its own, so the samples can tell the session apart.
  set -m
  bash "$here/session.sh" "$scratch/session" >"$artifacts/session.log" 2>&1 &
  root=$!
  set +m
  wait "$root" || fail "session.sh exited with code $?."
fi
sleep "$((idle * 60))"

{
  echo "Processes the session left running:"
  if [ "$os" = Linux ]; then
    left="$(sudo ip netns pids "$ns" | xargs -r ps -o pid=,args= -p | grep -v tcpdump || true)"
  else
    left="$(ps -axo pid=,comm= | node "$here/processes.mjs" "$artifacts/processes.txt" "$root")"
  fi
  echo "${left:-none}"
  echo
} | tee "$artifacts/leftovers.txt"
grep -qx none "$artifacts/leftovers.txt" || fail "The session left processes running."

# The control, inside the same capture: a lookup of example.com and a
# connection to it must show up, or a clean result would mean nothing.
control=(node "$here/control.mjs" "$artifacts/control.json")
if [ "$os" = Linux ]; then
  in_ns "${control[@]}" || fail "The control fetch of example.com failed."
else
  "${control[@]}" || fail "The control fetch of example.com failed."
fi
sleep 2
