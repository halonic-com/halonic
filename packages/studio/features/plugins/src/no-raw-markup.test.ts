import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Everything a plugin shows is untrusted text (ADR 2026-11-09-plugins, section 5; AGENTS.md).
 * The rendering tests check what Studio draws today; this test keeps the code from gaining a
 * way to draw anything else: no HTML from a string, no script, no window or page change of its
 * own, and no link but the kit's `ExternalLink`, which opens only `http` and `https` pages.
 */

/** A way to turn text into markup or script, or to leave Studio, that this package never uses. */
const sinks: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "dangerouslySetInnerHTML", pattern: /\bdangerouslySetInnerHTML\b/ },
  { name: "innerHTML or outerHTML", pattern: /\.(?:inner|outer)HTML\b/ },
  { name: "insertAdjacentHTML", pattern: /\binsertAdjacentHTML\b/ },
  { name: "document.write", pattern: /\bdocument\s*\.\s*write(?:ln)?\b/ },
  { name: "createContextualFragment", pattern: /\bcreateContextualFragment\b/ },
  { name: "DOMParser", pattern: /\bDOMParser\b/ },
  { name: "srcDoc", pattern: /\bsrcdoc\b/i },
  { name: "eval", pattern: /\beval\s*\(/ },
  { name: "new Function", pattern: /\bnew\s+Function\s*\(/ },
  { name: "window.open", pattern: /\bwindow\s*\.\s*open\b/ },
  { name: "a location change", pattern: /\blocation\s*\.\s*(?:href|assign|replace)\b/ },
  { name: "createElement", pattern: /\bcreateElement\s*\(/ },
];

/**
 * An element that loads or links, in JSX. Only `.tsx` files hold JSX, so a type such as
 * `Changes<object>` in a `.ts` file isn't one.
 */
const loadingElement =
  /<(?:a|img|iframe|frame|object|embed|script|link|form|svg|image|video|audio)[\s>/]/;

/**
 * Every `href` in `source` that isn't on an `ExternalLink`: the attribute's tag is read back from
 * the last `<` before it, so a tag written over several lines counts too.
 */
function hrefsOutsideExternalLink(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\bhref\s*=(?!=)/g)) {
    const tagStart = source.lastIndexOf("<", match.index);
    const tag = /^<([A-Za-z][\w.]*)/.exec(source.slice(tagStart))?.[1];
    if (tag !== "ExternalLink") found.push(tag ?? "no tag");
  }
  return found;
}

/** What `source` uses that this package must not; `jsx` when it is a `.tsx` file. */
function rawMarkup(source: string, jsx = true): string[] {
  const found = sinks.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
  if (!jsx) return found;
  if (loadingElement.test(source)) found.push("an element that loads or links");
  return [...found, ...hrefsOutsideExternalLink(source).map((tag) => `href on ${tag}`)];
}

/** The package's own code: tests and their helpers draw fixtures, never a plugin's text. */
function codeFiles(): string[] {
  return readdirSync(new URL("./", import.meta.url), { recursive: true, encoding: "utf8" })
    .map((file) => file.replaceAll("\\", "/"))
    .filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !/\.test\.tsx?$|\.test-helper\.tsx?$/.test(file) &&
        !file.startsWith("test-support"),
    );
}

describe("plugin text has no way to become markup", () => {
  it.each([
    "<div dangerouslySetInnerHTML={{ __html: text }} />",
    "node.innerHTML = text;",
    "node.outerHTML = text;",
    'node.insertAdjacentHTML("beforeend", text);',
    "document.write(text);",
    "range.createContextualFragment(text);",
    'new DOMParser().parseFromString(text, "text/html");',
    "<iframe srcDoc={text} />",
    "eval(text);",
    'new Function("return " + text);',
    "window.open(address);",
    "location.href = address;",
    "window.location.assign(address);",
    'createElement("a", { href: address });',
    "<a href={address}>{text}</a>",
    "<a\n  href={address}\n>",
    "<img src={address} />",
    "<svg>{text}</svg>",
    "<Button href={address}>Open</Button>",
    '<Link\n  className="x"\n  href={address}\n/>',
  ])("finds %j", (line) => {
    expect(rawMarkup(line)).not.toEqual([]);
  });

  it.each([
    "<ExternalLink href={inline.href}>{inline.text}</ExternalLink>",
    '<ExternalLink\n  className="x"\n  href={inline.href}\n>',
    "<span title={inline.href}>{text}</span>",
    "const { href } = link;",
    "<abbr>{text}</abbr>",
    "<article>{text}</article>",
    'if (link.href === "") return null;',
  ])("lets %j through", (line) => {
    expect(rawMarkup(line)).toEqual([]);
  });

  it("reads no JSX in a .ts file, where `<object>` is a type", () => {
    expect(rawMarkup("type Rows = Changes<object>;", false)).toEqual([]);
  });

  it("reads this package's code", () => {
    expect(codeFiles()).toContain("ui/plugin-result.tsx");
  });

  it("draws plugin text with React text and ExternalLink only", () => {
    const found = codeFiles().flatMap((file) =>
      rawMarkup(readFileSync(new URL(file, import.meta.url), "utf8"), file.endsWith(".tsx")).map(
        (what) => `${file}: ${what}`,
      ),
    );
    expect(found).toEqual([]);
  });
});
