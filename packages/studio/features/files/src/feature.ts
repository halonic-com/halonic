import { defineFeature } from "@halonicjs/studio-shell";
import { FilesHostService } from "./files-host.ts";
import { filesWords } from "./files-words.ts";

/**
 * The Files feature. Its file tree is the view behind the sidebar's Files switch; the tab, the
 * dialogs and the strips follow.
 */
export const filesFeature = defineFeature({
  id: "files",
  title: "Files",
  needs: [FilesHostService],
  register(studio) {
    studio.sidebarViews.add({
      id: "files",
      order: 1,
      label: filesWords.treeLabel,
      view: "FilesSidebarView",
      load: () => import("./ui/files-sidebar-view.tsx"),
    });
  },
});
