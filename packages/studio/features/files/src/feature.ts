import { defineFeature } from "@halonicjs/studio-shell";
import { FILE_KIND, FILES_VIEW, fileName } from "./file-item.ts";
import { FilesHostService } from "./files-host.ts";
import { filesWords } from "./files-words.ts";

/**
 * The Files feature. Its file tree is the view behind the sidebar's Files switch, and a file opens
 * in a tab with the code editor; the dialogs and the strips follow.
 */
export const filesFeature = defineFeature({
  id: "files",
  title: "Files",
  needs: [FilesHostService],
  register(studio) {
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
  },
});
