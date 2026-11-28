import { defineFeature, FilesWithErrorsService } from "@halonicjs/studio-shell";
import { CODE_KIND } from "./code-page.ts";
import { FILE_KIND, FILES_VIEW, fileName } from "./file-item.ts";
import { FileReviewService } from "./file-review.ts";
import { FilesHostService } from "./files-host.ts";
import { filesWords } from "./files-words.ts";
import { problemsSignal, subscribeProblems } from "./problems/problems-signal.ts";
import { codeRailEntry } from "./rail-entry.ts";

/**
 * The Files feature. Its file tree is the view behind the sidebar's Files switch and the list
 * column of Code's page, and a file opens beside it, or in a tab with the code editor; the
 * dialogs and the strips follow. The workspace's problem count, in the status bar or a phone's
 * strip, and Home's Problems open the files with errors at their first problem.
 */
export const filesFeature = defineFeature({
  id: "files",
  title: "Files",
  needs: [FilesHostService],
  wants: [FilesWithErrorsService, FileReviewService],
  register(studio) {
    studio.rail.add(codeRailEntry);
    studio.statusBar.add({
      id: "files.problems",
      order: 10,
      view: "ProblemsStatusItem",
      load: () => import("./problems/problems-status-item.tsx"),
    });
    studio.strips.add({
      id: "files.problems",
      order: 20,
      view: "ProblemsStrip",
      load: () => import("./problems/problems-strip.tsx"),
    });
    studio.home.addCard({
      id: "problems",
      view: "ProblemsHomeCard",
      load: () => import("./problems/problems-home-card.tsx"),
      signal: problemsSignal,
      subscribeSignal: subscribeProblems,
    });
    studio.sidebarViews.add({
      id: FILES_VIEW,
      order: 1,
      label: filesWords.treeLabel,
      view: "FilesSidebarView",
      load: () => import("./ui/files-sidebar-view.tsx"),
    });
    studio.itemKinds.add({
      kind: FILE_KIND,
      label: filesWords.fileKind,
      icon: "file",
      open: { view: "FileView", load: () => import("./ui/file-view.tsx") },
      // A file that is gone shows its own state in the tab, so the tab stays open.
      tab: { describe: (item) => ({ label: fileName(item.id) }), exists: () => true },
    });
    // Code's page, which the rail's Code entry opens (`files.code-page`).
    studio.itemKinds.add({
      kind: CODE_KIND,
      label: filesWords.codeTitle,
      icon: "code",
      open: { view: "CodePage", load: () => import("./ui/code-page.tsx") },
      tab: { describe: () => ({ label: filesWords.codeTitle }), exists: () => true },
    });
  },
});
