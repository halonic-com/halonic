#!/usr/bin/env bash
# Captures every packet of a CLI session with tcpdump, then a control run
# that must be seen, and writes the host lists. Needs passwordless sudo.
#
# Linux: the session runs in a network namespace of its own, with a route
# out to the internet. tcpdump listens on all of the namespace's interfaces,
# so it sees the session's packets and nothing of the runner's: any packet
# that isn't loopback fails the job.
# macOS: tcpdump listens on all interfaces, and its packet metadata names the
# process. Packets of `node` (the CLI and anything it starts) that aren't
# loopback fail the job; the rest is listed for review. A packet without a
# process (a reset after its socket closed) takes the process of its
# connection; one with no connection (ARP, ICMP) is listed for review.
#
# Usage: capture.sh <artifacts folder>. IDLE_MINUTES (default 10) is how long
# it keeps listening after the session.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
artifacts="$1"
scratch="${RUNNER_TEMP:-/tmp}/network-capture"
idle="${IDLE_MINUTES:-10}"
[[ "$idle" =~ ^[0-9]{1,3}$ ]] || { echo "IDLE_MINUTES must be a whole number of minutes, not $idle." >&2; exit 2; }
user="$(id -un)"
mkdir -p "$artifacts" "$scratch"
export HALONIC_CLI="$repo/apps/cli/src/main.ts"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

ns=halonic-capture
in_ns() { sudo ip netns exec "$ns" sudo -u "$user" env "PATH=$PATH" "HALONIC_CLI=$HALONIC_CLI" "$@"; }

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
  local uplink
  uplink="$(ip route show default | awk '{print $5; exit}')"
  sudo iptables -t nat -A POSTROUTING -s 10.203.0.0/30 -o "$uplink" -j MASQUERADE
  sudo iptables -I FORWARD -i hc-host -j ACCEPT
  sudo iptables -I FORWARD -o hc-host -j ACCEPT
  # The host's resolver listens on its own 127.0.0.53, which the namespace
  # can't reach; give the namespace the real upstream servers.
  sudo mkdir -p "/etc/netns/$ns"
  grep '^nameserver' /run/systemd/resolve/resolv.conf | sudo tee "/etc/netns/$ns/resolv.conf" >/dev/null
}

# start_capture <file>: tcpdump in the background, returns once it listens.
start_capture() {
  local file="$1" err="$1.log"
  if [ "$(uname -s)" = Linux ]; then
    sudo ip netns exec "$ns" tcpdump -i any -nn -U -Z root -w "$file" 2>"$err" &
  else
    sudo tcpdump -i any -nn -U -w "$file" 2>"$err" &
  fi
  for _ in $(seq 50); do grep -q 'listening on' "$err" 2>/dev/null && return; sleep 0.2; done
  cat "$err"
  return 1
}
stop_capture() {
  sudo pkill -INT -x tcpdump || true
  for _ in $(seq 50); do pgrep -x tcpdump >/dev/null || break; sleep 0.2; done
  sudo chown "$user" "$1"
}
# report <file> <title> [--expect-traffic]
report() {
  local file="$1"
  shift
  local show=(-r "$file" -nn -tttt)
  [ "$(uname -s)" = Darwin ] && show+=(-k)
  tcpdump "${show[@]}" 2>/dev/null >"$file.txt"
  node "$here/report.mjs" "$@" <"$file.txt"
}

os="$(uname -s)"
if [ "$os" = Linux ]; then
  linux_network
  ext=pcap
else
  ext=pcapng
fi
capture="$artifacts/capture.$ext"

echo "Capturing the session, then $idle minutes idle."
start_capture "$capture"
if [ "$os" = Linux ]; then
  in_ns bash "$here/session.sh" "$scratch/session" >"$artifacts/session.log" 2>&1
else
  bash "$here/session.sh" "$scratch/session" >"$artifacts/session.log" 2>&1
fi
sleep "$((idle * 60))"
{
  echo "Processes the session left running:"
  if [ "$os" = Linux ]; then
    sudo ip netns pids "$ns" | xargs -r ps -o pid=,args= -p | grep -v tcpdump || echo none
  else
    pgrep -fl "apps/cli/src/main.ts|model-stub.mjs" || echo none
  fi
} | tee "$artifacts/leftovers.txt"
stop_capture "$capture"

# The control: the same capture must see a lookup and a connection to
# example.com, or a clean result above would mean nothing.
control="$artifacts/control.$ext"
start_capture "$control"
fetch=(node --input-type=module -e 'await fetch("https://example.com").catch(() => {})')
if [ "$os" = Linux ]; then in_ns "${fetch[@]}"; else "${fetch[@]}"; fi
sleep 2
stop_capture "$control"

status=0
report "$capture" "Session on $os ($(uname -m))" >"$artifacts/hosts.md" || status=1
report "$control" "Control on $os: a fetch of example.com" --expect-traffic >"$artifacts/control.md" || {
  echo "The control fetch wasn't seen: the capture can't be trusted." >>"$artifacts/control.md"
  status=1
}
cat "$artifacts/hosts.md" "$artifacts/leftovers.txt" "$artifacts/control.md" >>"$summary"
grep -q '^none$' "$artifacts/leftovers.txt" || status=1
exit "$status"
