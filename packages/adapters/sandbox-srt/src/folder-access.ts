import type { RunProgram } from "./journal-acl.ts";

/** One entry of a folder's access list, as {@link readFolderAccess} reads it. */
export interface AccessRule {
  /** Who it is for, as a SID. */
  sid: string;
  allow: boolean;
  /** Whether the folder got it from the folder above it. */
  inherited: boolean;
  /** What it allows, as the system names it: `FullControl` for all. */
  rights: string;
}

/** Who owns a folder and who may do what in it. */
export interface FolderAccess {
  /** The owner, as a SID. */
  owner: string;
  /** Whether the folder takes nothing from the folder above it. */
  protectedFromParent: boolean;
  rules: AccessRule[];
}

/** The PowerShell of the system folder; `runFixed` starts it from there, never from the PATH. */
const powerShell = "WindowsPowerShell\\v1.0\\powershell.exe";

/** The script that prints a folder's owner and access list, one fact a line, with every name given as a SID. */
function readScript(folder: string): string {
  const path = folder.replaceAll("'", "''");
  return [
    `$a = Get-Acl -LiteralPath '${path}'`,
    "'owner ' + $a.GetOwner([Security.Principal.SecurityIdentifier]).Value",
    "'protected ' + $a.AreAccessRulesProtected",
    "foreach ($r in $a.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) { 'rule ' + $r.IdentityReference.Value + ' ' + $r.AccessControlType + ' ' + $r.IsInherited + ' ' + $r.FileSystemRights }",
  ].join("; ");
}

/**
 * Reads who owns a folder and its whole access list, inherited entries
 * included, with the fixed PowerShell of the system folder.
 *
 * @throws Error when the program fails or prints something unexpected
 */
export async function readFolderAccess(folder: string, start: RunProgram): Promise<FolderAccess> {
  const { stdout } = await start(powerShell, [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    readScript(folder),
  ]);
  return parseFolderAccess(stdout);
}

/** Reads what {@link readScript} prints; strictly, so a line it doesn't know is an error and not a guess. */
export function parseFolderAccess(output: string): FolderAccess {
  let owner: string | undefined;
  let protectedFromParent: boolean | undefined;
  const rules: AccessRule[] = [];
  for (const line of output.split(/\r?\n/).filter((text) => text.trim() !== "")) {
    const owned = /^owner (S-1-[0-9-]+)$/.exec(line);
    const protectedLine = /^protected (True|False)$/.exec(line);
    const rule = /^rule (S-1-[0-9-]+) (Allow|Deny) (True|False) (\S.*)$/.exec(line);
    if (owned !== null) owner = owned[1];
    else if (protectedLine !== null) protectedFromParent = protectedLine[1] === "True";
    else if (rule !== null) {
      rules.push({
        sid: rule[1] ?? "",
        allow: rule[2] === "Allow",
        inherited: rule[3] === "True",
        rights: (rule[4] ?? "").trim(),
      });
    } else throw new Error("the folder's access list could not be read: an unexpected line");
  }
  if (owner === undefined || protectedFromParent === undefined) {
    throw new Error("the folder's access list could not be read: no owner or no inheritance line");
  }
  return { owner, protectedFromParent, rules };
}

/**
 * The reason a folder is not private to `sid`, or `undefined` when it is: the
 * user owns it, it takes nothing from the folder above it, and its access list
 * is one entry that gives this user full control and nobody else anything.
 */
export function whyNotPrivateTo(access: FolderAccess, sid: string): string | undefined {
  if (access.owner !== sid) return "another account owns it";
  if (!access.protectedFromParent) return "it takes its access list from the folder above";
  const [only, ...more] = access.rules;
  if (only === undefined || more.length > 0) return "its access list is not exactly one entry";
  if (only.sid !== sid || !only.allow || only.inherited || only.rights !== "FullControl") {
    return "its one access entry is not full control for this user";
  }
  return undefined;
}
