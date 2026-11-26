import type { ReactNode } from "react";
import type { AgentTint } from "./agent-tint.ts";
import { Avatar } from "./avatar.tsx";

/** The props of `AuthorLine`. */
export interface AuthorLineProps {
  /** Who wrote it: "Chief". */
  readonly name: string;
  /** When, already written for the reader: "09:00", "Yesterday". */
  readonly time: ReactNode;
  /** Their picture, as `Avatar` takes it; without one, their initials show. */
  readonly picture?: ImageBitmap | undefined;
  /** An agent's own colour for the initials' tile; a person has none. */
  readonly tint?: AgentTint | undefined;
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
export function AuthorLine({ name, time, picture, tint, visualOnly = false }: AuthorLineProps) {
  return (
    <p
      aria-hidden={visualOnly ? true : undefined}
      className="flex items-center gap-2 text-small text-fg-muted"
    >
      <Avatar name={name} picture={picture} tint={tint} />
      <span>
        <bdi
          data-author-name
          aria-hidden={visualOnly ? true : undefined}
          className="font-semibold text-fg"
        >
          {name}
        </bdi>{" "}
        · {time}
      </span>
    </p>
  );
}
