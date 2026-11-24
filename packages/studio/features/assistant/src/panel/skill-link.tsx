import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import type { AssistantHost } from "../api.ts";
import { buildChatWords as words } from "../chat/build-chat-words.ts";

/** The props of {@link SkillLink}. */
export interface SkillLinkProps {
  readonly host: AssistantHost;
  readonly context: WorkspaceContext;
  /** Changes when the chat does, so a skill the assistant wrote shows as "edit skill". */
  readonly freshness: unknown;
}

/** The item a file's tab shows, as the files feature opens it. */
const fileItem = (path: string): ItemRef => ({ kind: "file", hub: "workspace", id: path });

/**
 * The quiet link under a Build chat's box (flow-assistant 5.10,
 * `assistant.build.authoring-skill-override`): "customize skill" writes the built-in authoring
 * skill into the workspace as an ordinary change and opens it in the editor in a tab; once the
 * workspace has its own skill, "edit skill" opens that one. A phone has no file editor, so no link.
 */
export function SkillLink({ host, context, freshness }: SkillLinkProps) {
  // `undefined` until the host says; `null` while the chat follows the built-in skill.
  const [own, setOwn] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void freshness; // read again whenever the chat changes

    host.authoringSkill().then(
      (path) => current && setOwn(path),
      () => current && setOwn(null),
    );
    return () => {
      current = false;
    };
  }, [host, freshness]);
  const open = context.openItemInNewTab ?? context.openItem;
  if (context.host === "phone" || own === undefined || open === undefined) return null;

  const customize = async () => {
    const path = own ?? (await writeSkill(host, context.saving));
    if (path === null) return;
    setOwn(path);
    open(fileItem(path));
  };
  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        className="text-caption text-accent-text underline-offset-2 hover:underline focus-ring"
        onClick={() => void customize()}
      >
        {own === null ? words.customizeSkill : words.editSkill}
      </button>
    </div>
  );
}

/**
 * Writes the built-in skill through the window's save state, as any other save: "Saving…" while
 * it writes, and "Couldn't save SKILL.md" with **Try again** when the disk refuses. Gives its path,
 * or `null` when it wasn't written.
 */
async function writeSkill(
  host: AssistantHost,
  saving: WorkspaceContext["saving"],
): Promise<string | null> {
  const written: string[] = [];
  const write = async () => {
    written.push(await host.customizeSkill());
  };
  const item = { key: "assistant/authoring-skill", title: "SKILL.md" };
  const saved = await (saving?.save(item, write) ??
    write().then(
      () => true,
      () => false,
    ));
  return saved ? (written[0] ?? null) : null;
}
