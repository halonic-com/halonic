import type { MessagingProject } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { useTooltip } from "@halonicjs/studio-kit";
import { useRef } from "react";
import { projectColour } from "../agent/project-colour.ts";

/** The props of {@link ProjectTag}. */
export interface ProjectTagProps {
  readonly project: MessagingProject;
  /**
   * In a row the name is cut with "…" and shows whole on hover; the open item's header shows it
   * whole (sketches B and E on HAL-19192).
   */
  readonly cut: boolean;
}

/**
 * An item's project as a row's and the header's line start with it (`inbox.project-dot`): a dot in
 * the project's colour, then its name. The dot is drawn only; the name says which project it is,
 * and screen readers hear it whole even when it is cut. In forced colours the dot keeps its circle
 * in the system's text colour.
 */
export function ProjectTag({ project, cut }: ProjectTagProps) {
  const name = markHiddenName(project.name);
  const shown = useRef<HTMLSpanElement>(null);
  const { anchor, popover } = useTooltip({
    text: name,
    visualOnly: true,
    showIf: () => shown.current !== null && shown.current.scrollWidth > shown.current.clientWidth,
  });
  const dot = projectDotClass(project.id);
  if (!cut) {
    return (
      <span className="inline-flex items-center gap-1.5 align-bottom">
        <span aria-hidden="true" className={dot} />
        <span>{name}</span>
      </span>
    );
  }
  return (
    <>
      <span className="inline-flex min-w-0 max-w-36 items-center gap-1.5 align-bottom" {...anchor}>
        <span aria-hidden="true" className={dot} />
        <span ref={shown} className="truncate">
          {name}
        </span>
      </span>
      {popover}
    </>
  );
}

/**
 * A project's 8px dot, in its colour (`inbox.project-dot`); in forced colours it keeps its circle
 * in the system's text colour. The project filter's chips and menu use it too.
 */
export function projectDotClass(id: string): string {
  return `size-2 shrink-0 rounded-full ${projectColour(id)} forced-color-adjust-none forced-colors:bg-[CanvasText]`;
}
