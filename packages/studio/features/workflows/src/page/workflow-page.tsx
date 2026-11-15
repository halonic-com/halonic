import type { ItemViewProps } from "@halonicjs/studio-shell";

/**
 * The workflow's page, until the canvas lands in the next pull request: the workflow's id
 * and nothing to press, so no control does nothing.
 */
export function WorkflowPage({ item }: ItemViewProps) {
  return (
    <div className="flex w-full flex-col gap-1 px-6 py-5">
      <p className="text-caption text-fg-muted">WORKFLOW</p>
      <h1 className="text-title">{item.id}</h1>
    </div>
  );
}
