import { readdir, readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, drawStyles, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import type { StepContext } from "../runner.ts";
import { clickTestSteps } from "../steps.ts";
import { keys } from "../webdriver.ts";
import { filesSearches, filesTreeSearch } from "./files-tree.ts";
import {
  countWords,
  filesTreeParts as parts,
  searchFiles,
  sidebarPanel,
  sidebarSwitch,
} from "./files-tree-parts.ts";
import { wideWindow } from "./wide-window.ts";

const repo = new URL("../../../../../", import.meta.url);
const { files: filesTab, studio: studioTab } = sidebarSwitch;

/** An invented workspace's files: one named after "writer", three under `agents/`. */
const listed = [
  "README.md",
  "hubs/reports/agents/reporter.agent.yaml",
  "hubs/support/agents/sorter.agent.yaml",
  "hubs/support/agents/writer.agent.yaml",
  "hubs/support/hub.yaml",
  "workspace.yaml",
];

/** How the fake Files view strays from the app; it strays in nothing by default. */
interface Strays {
  /** A tab the sidebar's switch lacks. */
  readonly withoutTab?: string;
  /** The view shows its tree without the search field above it. */
  readonly withoutField?: boolean;
  /** The files the tree lists. */
  readonly files?: readonly string[];
  /** The files a search shows, given those that match. */
  readonly shows?: (matching: readonly string[]) => readonly string[];
  /** What the count line reads for the file rows shown; undefined shows no line. */
  readonly says?: (shown: number) => string | undefined;
  /** Escape leaves the typed text in the field. */
  readonly escapeKeepsText?: boolean;
  /** How many more rows the tree shows after a search than before it. */
  readonly rowsLeftOpen?: number;
}

/** What the fake Files view shows now. */
interface View {
  onFiles: boolean;
  typed: string;
  searchedBefore: boolean;
}

/** The folders above the files, each counted once, as the rows a search holds open. */
function foldersAbove(paths: readonly string[]): number {
  const folders = new Set<string>();
  for (const path of paths) {
    const names = path.split("/");
    for (let depth = 1; depth < names.length; depth += 1) {
      folders.add(names.slice(0, depth).join("/"));
    }
  }
  return folders.size;
}

/** How many elements each of the step's XPaths finds while the field holds text. */
function countsWhileSearching(
  shown: readonly string[],
  line: string | undefined,
): Map<string, number> {
  const counts = new Map([
    [parts.rows, shown.length + foldersAbove(shown)],
    [parts.fileRows, shown.length],
    [parts.statusLines, line === undefined ? 0 : 1],
    [parts.rowAtLevel(2), shown.some((path) => path.includes("/")) ? 1 : 0],
  ]);
  for (const text of filesSearches) {
    counts.set(parts.fileRowsHolding(text), shown.filter((path) => path.includes(text)).length);
  }
  for (let count = 0; count <= listed.length; count += 1) {
    counts.set(parts.countLine(count), line === countWords(count) ? 1 : 0);
  }
  return counts;
}

/** How many elements each of the step's XPaths finds in the view now; none it doesn't name. */
function countsOf(view: View, files: readonly string[], strays: Strays): Map<string, number> {
  if (!view.onFiles) return new Map();
  const counts = new Map([
    [parts.search, strays.withoutField === true ? 0 : 1],
    [parts.rowAtLevel(1), Math.min(files.length, 1)],
  ]);
  if (view.typed === "") {
    const topLevel = new Set(files.map((path) => path.split("/")[0])).size;
    const leftOpen = view.searchedBefore ? (strays.rowsLeftOpen ?? 0) : 0;
    return counts.set(parts.rows, topLevel + leftOpen);
  }
  const matching = files.filter((path) => path.includes(view.typed));
  const shown = strays.shows?.(matching) ?? matching;
  const line = (strays.says ?? countWords)(shown.length);
  return new Map([...countsWhileSearching(shown, line), ...counts]);
}

/** A demo whose sidebar switches to a tree that searches as the app's does, but for `strays`. */
function studioWithFiles(strays: Strays = {}): { studio: FakeStudio; context: StepContext } {
  const studio = fakeStudio("Acme");
  const files = strays.files ?? listed;
  const view: View = { onFiles: false, typed: "", searchedBefore: false };
  for (const tab of [filesTab.text, studioTab.text]) {
    if (tab === strays.withoutTab) continue;
    button(studio, "main", tab, () => {
      view.onFiles = tab === filesTab.text;
    });
  }
  button(studio, "main", keys.escape, () => {
    if (strays.escapeKeepsText !== true) view.typed = "";
  });
  drawStyles(studio, parts.tree, { "padding-left": "10px" });
  const row = { height: "32px", "border-top-left-radius": "8px", "padding-left": "13px" };
  drawStyles(studio, parts.rowAtLevel(1), row);
  drawStyles(studio, parts.rowAtLevel(2), { ...row, "padding-left": "29px" });
  const driver = {
    ...studio.context.driver,
    count: async (xpath: string) => countsOf(view, files, strays).get(xpath) ?? 0,
    type: async (_xpath: string, text: string) => {
      studio.typed.push(text);
      view.typed += text;
      view.searchedBefore = true;
    },
  };
  return { studio, context: { ...studio.context, driver } };
}

const narrow = { width: 800, height: 600 };

verifies("studio-click-test.files-tree-step", () => {
  describe("step 35, the file tree's search and rows", () => {
    it("comes after the places, and names both Files requirements", () => {
      const ids = clickTestSteps.map((step) => step.id);
      // Not "last": a step another task adds after it must not fail this test.
      expect(ids.indexOf("files-tree-search")).toBeGreaterThan(ids.indexOf("places-open"));
      expect(filesTreeSearch.requirements).toEqual(["files.ui.tree-search", "files.ui.tree-rows"]);
    });

    it("searches twice in a wide window, presses Escape after each and goes back to Studio", async () => {
      const { studio, context } = studioWithFiles();
      await expect(filesTreeSearch.run(context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual(["writer", "agents/"]);
      expect(studio.clicks).toEqual([filesTab.text, keys.escape, keys.escape, studioTab.text]);
      expect(studio.resizes).toEqual([wideWindow, narrow]);
    });

    it("fails as NO_FILES_VIEW without the Files tab, and gives the window its size back", async () => {
      const { studio, context } = studioWithFiles({ withoutTab: filesTab.text });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_FILES_VIEW" });
      expect(studio.typed).toEqual([]);
      expect(studio.resizes).toEqual([wideWindow, narrow]);
    });

    it("fails as NO_FILE_TREE when the view lists no rows, and still goes back to Studio", async () => {
      const { studio, context } = studioWithFiles({ files: [] });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_FILE_TREE" });
      expect(studio.clicks).toEqual([filesTab.text, studioTab.text]);
    });

    it("fails as NO_FILE_TREE when the rows show without the search field", async () => {
      const { studio, context } = studioWithFiles({ withoutField: true });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_FILE_TREE" });
      expect(studio.typed).toEqual([]);
    });

    it("fails as SEARCH_SHOWS_OTHER_FILES when a search shows no file row at all", async () => {
      const { context } = studioWithFiles({ shows: () => [] });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "SEARCH_SHOWS_OTHER_FILES" });
      expect(outcome).toMatchObject({
        note: expect.stringContaining('"writer": the tree shows 0 file rows'),
      });
    });

    it("fails as NO_SEARCH_COUNT when no count shows under the field", async () => {
      const { context } = studioWithFiles({ says: () => undefined });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_SEARCH_COUNT" });
    });

    it("fails as SEARCH_SHOWS_OTHER_FILES when a file row lacks the text in its path", async () => {
      const { context } = studioWithFiles({ shows: (matching) => [...matching, "README.md"] });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "SEARCH_SHOWS_OTHER_FILES" });
      expect(outcome).toMatchObject({
        note: expect.stringContaining('"writer": the tree shows 2 file rows, 1 with it'),
      });
    });

    it("fails as SEARCH_COUNT_WRONG when the count isn't the number of file rows", async () => {
      const { context } = studioWithFiles({ says: (shown) => countWords(shown + 1) });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "SEARCH_COUNT_WRONG" });
      expect(outcome).toMatchObject({ note: expect.stringContaining('doesn\'t read "1 file"') });
    });

    it("fails as TREE_ROW_LOOK and names every size that is off", async () => {
      const { studio, context } = studioWithFiles();
      studio.styles.set(`${parts.rowAtLevel(1)} height`, "28px");
      studio.styles.set(`${parts.rowAtLevel(1)} border-top-left-radius`, "6px");
      studio.styles.set(`${parts.tree} padding-left`, "8px");
      studio.styles.set(`${parts.rowAtLevel(1)} padding-left`, "8px");
      studio.styles.set(`${parts.rowAtLevel(2)} padding-left`, "20px");
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "TREE_ROW_LOOK" });
      const note = outcome.passed ? "" : outcome.note;
      expect(note).toContain("a row is 28px high, not at least 32px");
      expect(note).toContain("a row's corners are 6px, not 8px");
      expect(note).toContain("the rows start 8px inside the column, not 10px");
      expect(note).toContain("a row at the top starts 8px in, not 13px");
      expect(note).toContain("starts at 20px and the top level at 8px, not 16px apart");
    });

    it("passes a row higher than 32px, as one with a name field's message is", async () => {
      const { studio, context } = studioWithFiles();
      studio.styles.set(`${parts.rowAtLevel(1)} height`, "40px");
      await expect(filesTreeSearch.run(context)).resolves.toEqual({ passed: true });
    });

    it("fails as NO_NESTED_ROW when the search shows no row one level in", async () => {
      const { context } = studioWithFiles({ files: ["writer.md"] });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_NESTED_ROW" });
    });

    it("fails as SEARCH_NOT_CLEARED when Escape leaves the count", async () => {
      const { studio, context } = studioWithFiles({ escapeKeepsText: true });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "SEARCH_NOT_CLEARED" });
      expect(studio.typed).toEqual(["writer"]);
    });

    it("fails as TREE_NOT_BACK when the tree shows other rows than before the search", async () => {
      const { studio, context } = studioWithFiles({ rowsLeftOpen: 2 });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "TREE_NOT_BACK" });
      expect(outcome).toMatchObject({ note: expect.stringContaining("shows 5 rows, not the 3") });
      expect(studio.clicks.at(-1)).toBe(studioTab.text);
    });

    it("fails as SIDEBAR_NOT_RESTORED when a passing step can't switch back to Studio", async () => {
      const { context } = studioWithFiles({ withoutTab: studioTab.text });
      const outcome = await filesTreeSearch.run(context);
      expect(outcome).toMatchObject({ passed: false, code: "SIDEBAR_NOT_RESTORED" });
    });
  });

  describe("the words and files step 35 relies on", () => {
    it("looks for every part under the sidebar switch's own panel, not in Code's list column", () => {
      const xpaths = [
        parts.tree,
        parts.rows,
        parts.fileRows,
        parts.fileRowsHolding("writer"),
        parts.rowAtLevel(1),
        parts.search,
        parts.statusLines,
        parts.countLine(1),
      ];
      for (const xpath of xpaths) {
        // A part that picks its first match is wrapped in brackets.
        expect(xpath.replace(/^\(/, "").startsWith(`${sidebarPanel}//`), xpath).toBe(true);
      }
      expect(sidebarPanel).toBe(
        "//*[@role='tablist' and @aria-label='Sidebar view']/following::*[@role='tabpanel'][1]",
      );
    });

    it.each([...Object.values(sidebarSwitch), searchFiles])(
      '"$text" is still in $file',
      async ({ text, file }) => {
        await expect(readFile(new URL(file, repo), "utf8")).resolves.toContain(`"${text}"`);
      },
    );

    it("the count is written as the Files words write it", async () => {
      const words = await readFile(new URL(searchFiles.file, repo), "utf8");
      expect(words).toMatch(/\(count === 1 \? "1 file" : `\$\{count\} files`\)/);
    });

    it("the Acme example the demo is made from has 1 file for the first search and 3 for the second", async () => {
      const entries = await readdir(new URL("examples/acme/", repo), { recursive: true });
      const paths = entries.map((entry) => entry.replaceAll("\\", "/"));
      const filePaths = paths.filter(
        (path) => !paths.some((other) => other.startsWith(`${path}/`)),
      );
      const [name, folder] = filesSearches;
      expect(filePaths.filter((path) => path.includes(name))).toHaveLength(1);
      expect(filePaths.filter((path) => path.includes(folder))).toHaveLength(3);
    });
  });
});
