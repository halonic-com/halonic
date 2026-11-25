import type { SandboxCommand, SandboxSession } from "@halonicjs/ports";

/**
 * The system calls the tracer records: every way a program can send to a
 * network address, TCP (`connect`) and UDP (`sendto`, `sendmsg`,
 * `sendmmsg`) alike, so a DNS question is recorded as well as a connection.
 */
const tracedCalls = "connect,sendto,sendmsg,sendmmsg";

/** One network address a traced program sent to or connected to. */
export interface TracedAttempt {
  call: string;
  address: string;
  port: number;
}

/** strace's text for an IPv4 or IPv6 address and its port, in any of the traced calls. */
const inetAddress =
  /sa_family=AF_INET6?, sin6?_port=htons\((\d+)\),.*?(?:inet_addr\("([^"]+)"\)|inet_pton\(AF_INET6, "([^"]+)")/;

/** The call a strace line is about: `connect(`, after the process id strace puts first with `-f`. */
const callName = /^(?:\[pid\s+)?\d*\]?\s*([a-z]+)\(/;

/**
 * The session as the test uses it: each program starts under strace, which
 * writes every network call of the program and all it starts to
 * `traceFile`. The fence is the session's own: strace runs inside it.
 */
export function tracedSession(session: SandboxSession, traceFile: string): SandboxSession {
  return {
    profile: session.profile,
    fence: session.fence,
    onBlocked: (listener) => session.onBlocked(listener),
    close: () => session.close(),
    start: (command) => session.start(underTracer(command, traceFile)),
  };
}

/** `command`, started by strace, which follows every process it starts. */
export function underTracer(command: SandboxCommand, traceFile: string): SandboxCommand {
  return {
    ...command,
    program: "strace",
    args: [
      "-f",
      "-qq",
      "-e",
      `trace=${tracedCalls}`,
      "-e",
      "signal=none",
      "-o",
      traceFile,
      "--",
      command.program,
      ...command.args,
    ],
  };
}

/**
 * Every IPv4 and IPv6 address in a strace output, with its call and port.
 * Local sockets (`AF_UNIX`, `AF_NETLINK`) aren't network attempts and are
 * left out; so are calls that name no address, such as a `sendto` on a
 * socket already connected (its `connect` is in the trace).
 */
export function readTrace(text: string): TracedAttempt[] {
  const attempts: TracedAttempt[] = [];
  for (const line of text.split("\n")) {
    const address = inetAddress.exec(line);
    if (address === null) continue;
    const [, port = "", ipv4, ipv6] = address;
    attempts.push({
      call: callName.exec(line)?.[1] ?? "unknown",
      address: ipv4 ?? ipv6 ?? "",
      port: Number(port),
    });
  }
  return attempts;
}

/**
 * The attempts that could leave the fence: any address that isn't loopback,
 * and any DNS question (port 53), loopback included, since a resolver on the
 * host's loopback (`127.0.0.53`) would send the name on.
 *
 * Other loopback addresses stay inside the fence: srt gives it a network
 * namespace of its own (the own-loopback canary in sandbox-srt), where
 * srt's proxy and OpenCode's private server listen.
 */
export function attemptsOut(attempts: readonly TracedAttempt[]): TracedAttempt[] {
  return attempts.filter((attempt) => attempt.port === 53 || !isLoopback(attempt.address));
}

function isLoopback(address: string): boolean {
  return address.startsWith("127.") || address === "::1" || address.startsWith("::ffff:127.");
}
