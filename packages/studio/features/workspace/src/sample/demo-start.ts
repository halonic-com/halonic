import { itemLocationKey, type StudioWorkspace } from "@halonicjs/studio-shell";

/**
 * Acme's support workflow, the one the demo's first run starts (first-run-flow 3.2). The app's
 * `sample-files.test.ts` fails if the bundled Acme no longer has it here, under this name.
 */
const supportReply = { kind: "workflow", hub: "support", id: "support-reply" } as const;

/**
 * Puts a demo that has just opened on Acme's **Support reply**, with the Workflows list one Back
 * step behind it (`workspace.try-sample`, first-run-flow 3.2). The Workflows list has no selected
 * row of its own, so the workflow's page is what "selected" shows. Called before the workspace is
 * first drawn, so Home never shows first. The tab's title is the workflow's name in Acme; the
 * workflow kind renames the tab if the file says otherwise.
 *
 * @example
 * openOnSupportReply(opened.workspace);
 */
export function openOnSupportReply(workspace: StudioWorkspace): void {
  workspace.tabs.openHere({ key: "workflows", title: "Workflows" });
  workspace.tabs.openHere({
    key: itemLocationKey(supportReply),
    title: "Support reply",
    kind: "workflow",
  });
}
