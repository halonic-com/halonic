import { describe, expect, it } from "vitest";
import { attemptsOut, readTrace, underTracer } from "./network-trace.ts";

// strace's lines as `strace -f` writes them; the addresses are documentation ones.
const trace = [
  '4101  connect(3, {sa_family=AF_UNIX, sun_path="/var/run/nscd/socket"}, 110) = -1 ENOENT (No such file or directory)',
  '4101  connect(3, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("127.0.0.53")}, 16) = 0',
  '4101  sendmmsg(3, [{msg_hdr={msg_name=NULL, msg_namelen=0, msg_iov=[{iov_base="\\x12\\x34", iov_len=2}]}}], 1, MSG_NOSIGNAL) = 1',
  '4102  connect(9, {sa_family=AF_INET, sin_port=htons(3128), sin_addr=inet_addr("127.0.0.1")}, 16) = 0',
  '4102  connect(10, {sa_family=AF_INET6, sin6_port=htons(443), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2001:db8::1", &sin6_addr), sin6_scope_id=0}, 28) = -1 ENETUNREACH (Network is unreachable)',
  '4103  sendto(4, "\\x00", 1, MSG_NOSIGNAL, {sa_family=AF_INET, sin_port=htons(123), sin_addr=inet_addr("192.0.2.7")}, 16) = -1 ENETUNREACH (Network is unreachable)',
  "4104  +++ exited with 0 +++",
].join("\n");

describe("the network trace", () => {
  it("reads every IPv4 and IPv6 address with its call and port, and leaves local sockets out", () => {
    expect(readTrace(trace)).toEqual([
      { call: "connect", address: "127.0.0.53", port: 53 },
      { call: "connect", address: "127.0.0.1", port: 3128 },
      { call: "connect", address: "2001:db8::1", port: 443 },
      { call: "sendto", address: "192.0.2.7", port: 123 },
    ]);
  });

  it("counts every address off the loopback and every DNS question as an attempt out", () => {
    expect(attemptsOut(readTrace(trace))).toEqual([
      { call: "connect", address: "127.0.0.53", port: 53 },
      { call: "connect", address: "2001:db8::1", port: 443 },
      { call: "sendto", address: "192.0.2.7", port: 123 },
    ]);
  });

  it("starts the program under strace, following every process it starts", () => {
    expect(underTracer({ program: "opencode", args: ["run"] }, "/acme/trace.txt")).toEqual({
      program: "strace",
      args: [
        "-f",
        "-qq",
        "-e",
        "trace=connect,sendto,sendmsg,sendmmsg",
        "-e",
        "signal=none",
        "-o",
        "/acme/trace.txt",
        "--",
        "opencode",
        "run",
      ],
    });
  });
});
