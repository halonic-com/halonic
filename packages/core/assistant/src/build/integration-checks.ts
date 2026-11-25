// What the Build chat's `validate` checks in the workspace's local
// integrations (`assistant.build.validate-integrations`): each permission
// sheet, the code against its sheet, and the static rules on the code.
//
// The sheet check is the one `halonic validate` runs. The two checks on the
// code read it as text, so the model can fix its own mistakes before the
// person reviews them. They are hints for the model, not a security
// boundary: code gets around them easily, with an alias, a computed name
// or an encoded string. What protects the person is the kit, which lets
// the code reach only the sheet's hosts and secrets and refuses code that
// declares other tools than its sheet, the isolated runner (I5), and the
// sheet the person approves before anything runs.

import { integrationSheetProblems, readIntegrationSheets } from "@halonicjs/app";
import type { IntegrationSheet } from "@halonicjs/format";
import type { DefinitionSource } from "@halonicjs/ports";
import type { WorkspaceIssue } from "@halonicjs/workspace";

/** One file of an integration's code, such as `integrations/notes/backend/index.js`. */
interface CodeFile {
  readonly path: string;
  readonly text: string;
}

/** What the code says about one tool it declares, and where. */
interface CodeTool {
  readonly name: string;
  readonly risk: string;
  /** `undefined` when the declaration doesn't say. */
  readonly untrusted: boolean | undefined;
  readonly file: string;
  readonly line: number;
}

/** A rule the code must keep, and the pattern that finds the direct form of breaking it. */
interface StaticRule {
  readonly code: string;
  readonly pattern: RegExp;
  readonly message: string;
}

/** The files that hold an integration's code. */
const codeFileName = /\.(?:js|mjs|cjs)$/u;

/** Not after a letter, a digit, `$` or a `.`, so `host.http.fetch(` isn't the global `fetch`. */
const bare = String.raw`(?<![\w$.])`;

/** Node's built-in modules an integration might reach for, besides any `node:` name. */
const nodeModules = [
  "child_process",
  "crypto",
  "dns",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "net",
  "os",
  "path",
  "process",
  "tls",
  "vm",
  "worker_threads",
];

const nodeModulePattern = `node:[\\w/]+|${nodeModules.join("|")}`;

/** The static rules (guide section 10, rule 4), in the order they are reported. */
const staticRules: readonly StaticRule[] = [
  {
    code: "eval",
    pattern: new RegExp(`${bare}eval\\s*\\(`, "gu"),
    message: "uses eval, which an integration may not use",
  },
  {
    code: "function-constructor",
    pattern: new RegExp(`${bare}Function\\s*\\(`, "gu"),
    message: "uses Function to build code from text, which an integration may not do",
  },
  {
    code: "dynamic-import",
    pattern: new RegExp(`${bare}import\\s*\\(`, "gu"),
    message: "uses a dynamic import(), which an integration may not use",
  },
  {
    code: "fetch",
    pattern: new RegExp(
      `${bare}fetch\\s*\\(|${bare}(?:globalThis|window|self)\\s*\\.\\s*fetch\\b`,
      "gu",
    ),
    message: "uses fetch; send requests through the kit's host.http instead",
  },
  {
    code: "node-module",
    pattern: new RegExp(
      `(?:${bare}from|${bare}import|${bare}require\\s*\\()\\s*["'](?:${nodeModulePattern})["']`,
      "gu",
    ),
    message: "uses a Node built-in module; an integration reaches the outside only through the kit",
  },
  {
    code: "node-process",
    pattern: new RegExp(`${bare}process\\s*\\.`, "gu"),
    message: "uses Node's process; read settings from the kit's host.settings instead",
  },
];

/**
 * The problems of every local integration in `workspace`: each sheet that
 * doesn't parse (as `halonic validate` gives them), then for each sheet
 * that does, where its code and the sheet disagree and where the code
 * breaks a static rule. All of them are errors.
 *
 * @param workspace - the workspace as saved, changes to review included
 *
 * @example
 * await integrationProblems(store);
 * // [{ file: "integrations/notes/backend/index.js", line: 12, message: "uses fetch; …", … }]
 */
export async function integrationProblems(workspace: DefinitionSource): Promise<WorkspaceIssue[]> {
  const problems = await integrationSheetProblems(workspace);
  for (const { folder, sheet } of await readIntegrationSheets(workspace)) {
    const code = await codeFiles(workspace, folder);
    problems.push(...sheetMismatches(folder, sheet, code), ...staticRuleHits(code));
  }
  return problems;
}

/** Every code file in `folder`, by path. A file that can't be read is left out. */
async function codeFiles(workspace: DefinitionSource, folder: string): Promise<CodeFile[]> {
  let paths: string[];
  try {
    paths = await workspace.list(folder);
  } catch {
    return [];
  }
  const files: CodeFile[] = [];
  for (const path of paths.filter((each) => codeFileName.test(each)).sort()) {
    const text = await workspace.read(path).catch(() => null);
    if (text !== null) files.push({ path, text });
  }
  return files;
}

/**
 * Where the code and the sheet disagree about the tools: a tool only one
 * of them declares, or one whose `risk` or `untrusted` differs. The kit
 * refuses to load such code (`declarationProblems`); this says so earlier.
 */
function sheetMismatches(
  folder: string,
  sheet: IntegrationSheet,
  code: readonly CodeFile[],
): WorkspaceIssue[] {
  const problems: WorkspaceIssue[] = [];
  const declared = new Map(code.flatMap(codeTools).map((tool) => [tool.name, tool]));
  for (const tool of sheet.tools) {
    const inCode = declared.get(tool.name);
    declared.delete(tool.name);
    if (inCode === undefined) {
      const message = `the sheet declares the tool "${tool.name}", but the code doesn't`;
      problems.push(issue(`${folder}/integration.yaml`, 1, "tool-not-in-code", message));
      continue;
    }
    if (inCode.risk !== tool.risk) {
      const message = `"${tool.name}" has risk ${inCode.risk} in the code, but ${tool.risk} on the sheet`;
      problems.push(issue(inCode.file, inCode.line, "risk-differs", message));
    }
    if (inCode.untrusted !== tool.untrusted) {
      const said = inCode.untrusted === undefined ? "doesn't say" : `says ${inCode.untrusted}`;
      const message = `"${tool.name}": the code ${said} for untrusted, but the sheet says ${tool.untrusted}`;
      problems.push(issue(inCode.file, inCode.line, "untrusted-differs", message));
    }
  }
  for (const tool of declared.values()) {
    const message = `the code declares the tool "${tool.name}", but the sheet doesn't`;
    problems.push(issue(tool.file, tool.line, "tool-not-on-sheet", message));
  }
  return problems;
}

/**
 * The tools one code file declares: each `name: "…"` followed by a
 * `risk: "…"` before the next `name:`. A `name` without a risk, such as the
 * integration's own, isn't a tool.
 */
function codeTools(file: CodeFile): CodeTool[] {
  const names = [...file.text.matchAll(/\bname\s*:\s*(["'`])([^"'`\n]+)\1/gu)];
  const tools: CodeTool[] = [];
  names.forEach((match, index) => {
    const start = match.index;
    const end = names[index + 1]?.index ?? file.text.length;
    const declaration = file.text.slice(start, end);
    const risk = /\brisk\s*:\s*["'`](\w+)["'`]/u.exec(declaration)?.[1];
    if (risk === undefined) return;
    const untrusted = /\buntrusted\s*:\s*(true|false)\b/u.exec(declaration)?.[1];
    tools.push({
      name: match[2] ?? "",
      risk,
      untrusted: untrusted === undefined ? undefined : untrusted === "true",
      file: file.path,
      line: lineAt(file.text, start),
    });
  });
  return tools;
}

/** Each place the code breaks one of the {@link staticRules}. */
function staticRuleHits(code: readonly CodeFile[]): WorkspaceIssue[] {
  const problems: WorkspaceIssue[] = [];
  for (const file of code) {
    for (const rule of staticRules) {
      for (const match of file.text.matchAll(rule.pattern)) {
        problems.push(issue(file.path, lineAt(file.text, match.index), rule.code, rule.message));
      }
    }
  }
  return problems;
}

function issue(file: string, line: number, code: string, message: string): WorkspaceIssue {
  return { file, line, col: 1, severity: "error", source: "check", code, path: [], message };
}

/** The 1-based line of the character at `index`. */
function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}
