import { docsReaders } from "../lib/affected-tests.ts";
import type { CheckContext } from "../lib/context.ts";
import { findDocReads } from "../lib/doc-reads.ts";
import { Report } from "../lib/problems.ts";

const listFile = "tooling/check/src/lib/affected-tests.ts";

/**
 * `docsReaders` in `lib/affected-tests.ts` names, for each doc a test reads,
 * the packages whose tests read it, so a change to that doc runs them. A
 * test in `tooling/check` compares the two, but it runs only when
 * `tooling/check` changes, so a pull request adding a test that reads a doc
 * could merge without the entry and turn later pull requests red
 * (HAL-19264). `pnpm check` runs on every pull request.
 *
 * @param listed the map to check; the real `docsReaders` unless a test passes one
 */
export function checkDocsReaders(
  context: Pick<CheckContext, "files" | "packages" | "read">,
  listed: Readonly<Record<string, readonly string[]>> = docsReaders,
): Report {
  const report = new Report("docs-readers");
  const readersByDoc = new Map<string, Set<string>>();
  for (const { file, line, doc, reader } of findDocReads(context)) {
    readersByDoc.set(doc, new Set([...(readersByDoc.get(doc) ?? []), reader]));
    const entry = Object.hasOwn(listed, doc) ? listed[doc] : undefined;
    if (!entry?.includes(reader)) {
      report.error(
        file,
        `This test reads ${doc}, but docsReaders in ${listFile} doesn't list ${reader} for it, so a change to that doc wouldn't run this test. Add "${reader}" to its entry.`,
        line,
      );
    }
  }
  // The map's entries name this repo's docs: a tree without the file that
  // holds the map, such as a test's fixture repo, has none of them.
  if (!context.files.includes(listFile)) {
    return report;
  }
  for (const [doc, readers] of Object.entries(listed)) {
    if (!context.files.includes(doc)) {
      report.error(listFile, `docsReaders lists ${doc}, which doesn't exist. Remove its entry.`);
      continue;
    }
    for (const reader of readers.filter((name) => !readersByDoc.get(doc)?.has(name))) {
      report.error(
        listFile,
        `docsReaders lists ${reader} for ${doc}, but none of that package's tests read it. Remove ${reader} from its entry.`,
      );
    }
  }
  return report;
}
