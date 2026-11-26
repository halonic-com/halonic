import type { KeysUnavailable, ListedComputer, PairedComputer } from "../phone-tunnel.ts";

/** The readable computer connected last, else paired last: the one the phone app opens. */
export function latest(
  computers: readonly ListedComputer[] | KeysUnavailable | undefined,
): PairedComputer | undefined {
  if (!Array.isArray(computers)) return undefined;
  const readable = computers.filter(
    (computer): computer is PairedComputer => computer.standing !== "unreadable",
  );
  const when = (computer: PairedComputer) => computer.lastConnectedAt ?? computer.pairedAt;
  return readable.sort((a, b) => when(b).localeCompare(when(a)))[0];
}
