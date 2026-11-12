import { readdir, readFile, readlink } from "node:fs/promises";

/**
 * W9: no process of ours may hold a network listener, or any socket another
 * program on this computer could reach. On Windows with WSL 2 the loopback
 * is shared by every distro of the user, and an abstract Unix socket is shared
 * by every program in its network namespace, so only a socket in a folder
 * that is ours (mode 0700) is safe.
 *
 * Until srt stops opening its own proxy's loopback listener
 * (HAL-6321, upstream fix tracked on HAL-6349), the check allows exactly one
 * IPv4 TCP listener on 127.0.0.1 in each srt process. Removing the exception
 * is this one change: set this to `false`.
 */
export const allowSrtLoopbackListener = true;

/** What tells a process is srt's own: the library's command line program. */
const srtProgram = "sandbox-runtime/dist/cli.js";

/** A line of one of the tables in `/proc/net`, kept as its words. */
type Row = string[];

/** The process ids under `rootPid`, itself included. */
export async function processTree(rootPid: number): Promise<number[]> {
  const parents = new Map<number, number>();
  for (const entry of await readdir("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await readFile(`/proc/${entry}/stat`, "utf8").catch(() => "");
    // The name sits in parentheses and may hold spaces: the fields start after the last one.
    const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const parent = Number(rest[1]);
    if (Number.isInteger(parent)) parents.set(Number(entry), parent);
  }
  const tree = [rootPid];
  for (const pid of tree) {
    for (const [child, parent] of parents) {
      if (parent === pid && !tree.includes(child)) tree.push(child);
    }
  }
  return tree;
}

/** The socket inodes a process holds, which `/proc/<pid>/fd` links as `socket:[<inode>]`. */
async function socketInodes(pid: number): Promise<Set<string>> {
  const inodes = new Set<string>();
  const fds = await readdir(`/proc/${pid}/fd`).catch(() => []);
  for (const fd of fds) {
    const target = await readlink(`/proc/${pid}/fd/${fd}`).catch(() => "");
    const match = /^socket:\[(\d+)\]$/.exec(target);
    if (match?.[1] !== undefined) inodes.add(match[1]);
  }
  return inodes;
}

async function rowsOf(table: string): Promise<Row[]> {
  const text = await readFile(`/proc/net/${table}`, "utf8").catch(() => "");
  return text
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((row) => row.length > 1 && row[0] !== "");
}

const listenState = "0A";
const loopbackV4 = "0100007F";

/** The rows of `/proc/net` that hold sockets, by table. */
interface Tables {
  tcp: Row[];
  tcp6: Row[];
  udp: Row[];
  udp6: Row[];
  unix: Row[];
}

async function readTables(): Promise<Tables> {
  const [tcp, tcp6, udp, udp6, unix] = await Promise.all(
    ["tcp", "tcp6", "udp", "udp6", "unix"].map(rowsOf),
  );
  return { tcp: tcp ?? [], tcp6: tcp6 ?? [], udp: udp ?? [], udp6: udp6 ?? [], unix: unix ?? [] };
}

/** The port in a row's local address (`<hex address>:<hex port>`). */
function portOf(row: Row): number {
  return Number.parseInt((row[1] ?? "").split(":")[1] ?? "", 16);
}

/** The listeners (TCP rows in state LISTEN) among `rows` that `inodes` hold. */
function listeners(rows: Row[], inodes: Set<string>): Row[] {
  return rows.filter((row) => inodes.has(row[9] ?? "") && row[3] === listenState);
}

/** The IPv4 TCP listeners of a process that W9 forbids: all but srt's one on 127.0.0.1, while the exception stands. */
function forbiddenTcp(who: string, isSrt: boolean, inodes: Set<string>, tcp: Row[]): string[] {
  const found: string[] = [];
  let exceptionUsed = false;
  for (const row of listeners(tcp, inodes)) {
    const onLoopback = (row[1] ?? "").startsWith(`${loopbackV4}:`);
    if (allowSrtLoopbackListener && isSrt && onLoopback && !exceptionUsed) {
      exceptionUsed = true;
      continue;
    }
    const where = onLoopback ? "127.0.0.1" : "an address other than 127.0.0.1";
    found.push(`${who} listens on TCP port ${portOf(row)}, on ${where}`);
  }
  return found;
}

/** What one process, whose socket inodes are `inodes`, does against W9. */
function violationsOf(who: string, isSrt: boolean, inodes: Set<string>, tables: Tables): string[] {
  const found = forbiddenTcp(who, isSrt, inodes, tables.tcp);
  for (const row of listeners(tables.tcp6, inodes)) {
    found.push(`${who} listens on IPv6 TCP port ${portOf(row)}`);
  }
  for (const row of [...tables.udp, ...tables.udp6]) {
    if (inodes.has(row[9] ?? "")) found.push(`${who} holds a UDP socket`);
  }
  for (const row of tables.unix) {
    if (inodes.has(row[6] ?? "") && (row[7] ?? "").startsWith("@")) {
      found.push(`${who} holds an abstract Unix socket`);
    }
  }
  return found;
}

/**
 * Every way the processes under `rootPid` break W9, as short sentences with
 * no path or address that could hold a secret: the ports are listed because
 * they are the thing to find. An empty list is a pass.
 *
 * A process holds a listener when its `/proc/<pid>/fd` links the socket's
 * inode, so a listener of a program that isn't ours never counts, and a
 * socket of ours is never missed because of the address it hides behind.
 */
export async function w9Violations(rootPid: number): Promise<string[]> {
  const tables = await readTables();
  const violations: string[] = [];
  for (const pid of await processTree(rootPid)) {
    const inodes = await socketInodes(pid);
    if (inodes.size === 0) continue;
    const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
    const isSrt = cmdline.includes(srtProgram);
    const who = isSrt ? `srt process ${pid}` : `process ${pid}`;
    violations.push(...violationsOf(who, isSrt, inodes, tables));
  }
  return violations;
}
