import ts from "@typescript/typescript6";
import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isSourceFile, isTestFile, namesToolConfig } from "../lib/source-files.ts";
import { owningPackage, type WorkspacePackage } from "../lib/workspace.ts";
import { inPackagePath } from "./layers.ts";

const guide = "See docs/guides/checks.md (webview-apis).";

/** The workspace package that builds Studio's page. */
export const studioApp = "@halonicjs/app-studio";

/**
 * Web APIs that Studio's oldest webviews (WebKitGTK 2.44, which is Safari
 * 17.5, and Chromium 123; see packages/studio/kit/README.md) don't have, with
 * the versions that brought them and what to write instead. Each name is a
 * static member of a class in `watchedBuiltIns`.
 */
const tooNew: Readonly<Record<string, { since: string; instead: string }>> = {
  "URL.parse": {
    since: "Safari 18 and Chromium 126",
    instead: "new URL(…) in a try, or URL.canParse(…) first",
  },
};

/**
 * Code that Studio's page loads may not use a web API its oldest webviews
 * lack, such as `URL.parse`. That code is the Studio app and every workspace
 * package it depends on, directly or through others (`dependencies`,
 * `peerDependencies` and `optionalDependencies`; dev dependencies don't ship).
 * Tests and tool config files are exempt: they run in Node.
 */
export function checkWebviewApis(context: CheckContext): Report {
  const report = new Report("webview-apis");
  const loaded = packagesStudioLoads(context);
  for (const file of context.files) {
    if (!isSourceFile(file) || isTestFile(file)) {
      continue;
    }
    const pkg = owningPackage(file, context.packages);
    if (pkg === undefined || !loaded.has(pkg) || namesToolConfig(inPackagePath(file, pkg))) {
      continue;
    }
    for (const member of findBuiltInMembers(file, context.read(file))) {
      const api = tooNew[member.name];
      if (api !== undefined) {
        report.error(
          file,
          `uses ${member.name}, which Studio's oldest webviews don't have (it came with ${api.since}), and ${pkg.manifest.name ?? pkg.directory} runs in Studio's page. Write ${api.instead}. ${guide}`,
          member.line,
        );
      }
    }
  }
  return report;
}

/** The Studio app and the workspace packages it depends on, directly or not. */
function packagesStudioLoads(context: CheckContext): Set<WorkspacePackage> {
  const loaded = new Set<WorkspacePackage>();
  const waiting = [studioApp];
  for (let name = waiting.pop(); name !== undefined; name = waiting.pop()) {
    const pkg = context.packagesByName.get(name);
    if (pkg === undefined || loaded.has(pkg)) {
      continue;
    }
    loaded.add(pkg);
    const { dependencies, peerDependencies, optionalDependencies } = pkg.manifest;
    for (const field of [dependencies, peerDependencies, optionalDependencies]) {
      waiting.push(...Object.keys(field ?? {}));
    }
  }
  return loaded;
}

/** A read of a static member of a built-in class, such as `URL.parse`. */
export interface BuiltInMember {
  /** The class and the member, such as `URL.parse`. */
  readonly name: string;
  readonly line: number;
}

/** The built-in classes whose static members `findBuiltInMembers` lists. */
const watchedBuiltIns = new Set(["URL"]);

/** The objects a global such as `URL` can be read from. */
const globalObjects = new Set(["globalThis", "global", "self", "window"]);

/**
 * Finds the static members of the classes in `watchedBuiltIns` that a file
 * reads, such as `URL.parse` in `URL.parse(…)`, `URL["parse"]` or
 * `globalThis.URL.parse`. The rule parses the file itself rather than
 * through `sourceFacts`, so the guard's trust roots in `lib/` stay as they are.
 *
 * @example
 * findBuiltInMembers("a.ts", "URL.parse(x);");
 * // [{ name: "URL.parse", line: 1 }]
 */
export function findBuiltInMembers(fileName: string, text: string): BuiltInMember[] {
  if (![...watchedBuiltIns].some((className) => text.includes(className))) {
    return [];
  }
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  );
  const members: BuiltInMember[] = [];
  const visit = (node: ts.Node): void => {
    const name = builtInMemberOf(node);
    if (name !== undefined) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      members.push({ name, line });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return members;
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (fileName.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (/\.[cm]?js$/.test(fileName)) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/** The `Class.member` a node reads, when the class is in `watchedBuiltIns`. */
function builtInMemberOf(node: ts.Node): string | undefined {
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) {
    return undefined;
  }
  const base = unwrap(node.expression);
  const className = ts.isIdentifier(base) || isOnGlobalObject(base) ? memberName(base) : undefined;
  const key = memberName(node);
  if (className === undefined || key === undefined || !watchedBuiltIns.has(className)) {
    return undefined;
  }
  return `${className}.${key}`;
}

/** True for `globalThis.name`, `window.name` and the like. */
function isOnGlobalObject(node: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(node)) {
    return false;
  }
  const owner = unwrap(node.expression);
  return ts.isIdentifier(owner) && globalObjects.has(owner.text);
}

/** The expression inside parentheses, casts, `satisfies` and `!`. */
function unwrap(node: ts.Expression): ts.Expression {
  let inner = node;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner) ||
    ts.isNonNullExpression(inner) ||
    ts.isTypeAssertionExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

/** The name an identifier, `a.name` or `a["name"]` refers to. */
function memberName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) {
    const isMemberName = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
    return isMemberName ? undefined : node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}
