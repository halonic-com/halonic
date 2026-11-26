import type { ReactNode } from "react";
import type { AgentTint } from "./agent-tint.ts";
import { Avatar, type AvatarSize } from "./avatar.tsx";

/** The props of `AuthorLine`. */
export interface AuthorLineProps {
  /** Who wrote it: "Chief". */
  readonly name: string;
  /**
   * When, already written for the reader: "09:00", "Yesterday"; or what else the line says after
   * the name, such as a PR's "task HAL-17451 · 312 lines". Without it, the name stands alone.
   */
  readonly time?: ReactNode;
  /** Their picture, as `Avatar` takes it; without one, their initials show. */
  readonly picture?: ImageBitmap | undefined;
  /** An agent's own colour for the initials' tile; a person has none. */
  readonly tint?: AgentTint | undefined;
  /** The avatar's size: 28px over a message (the default), 40px in an open item's header. */
  readonly size?: AvatarSize;
  /**
   * The line is for the eye only, because the message already says who wrote it to a screen
   * reader, as the Messenger's hidden "Chief: " does. Without it, the line is read.
   */
  readonly visualOnly?: boolean;
}

/**
 * Who wrote a message and when, above it: their avatar, then "Chief · 09:00" with the name
 * semibold in the normal text colour and the rest muted (`kit.author-line`), the same line in the
 * Messenger and in Studio. The name is a `bdi`, so a right-to-left name keeps the dot on its side.
 *
 * @example
 * <AuthorLine name="Chief" time="09:00" tint={agentTint(agent.id)} visualOnly />
 */
export function AuthorLine({
  name,
  time,
  picture,
  tint,
  size,
  visualOnly = false,
}: AuthorLineProps) {
  const hasTime = time !== undefined && time !== null && time !== "";
  return (
    <p
      aria-hidden={visualOnly ? true : undefined}
      className="flex items-center gap-2 text-small text-fg-muted"
    >
      <Avatar name={name} picture={picture} tint={tint} {...(size === undefined ? {} : { size })} />
      <span className="min-w-0 wrap-anywhere">
        <bdi
          data-author-name
          aria-hidden={visualOnly ? true : undefined}
          className="font-semibold text-fg"
        >
          {name}
        </bdi>
        {hasTime ? <> · {time}</> : null}
      </span>
    </p>
  );
}
