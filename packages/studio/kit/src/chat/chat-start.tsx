import type { ReactNode } from "react";

/** The props of `ChatStart`. */
export interface ChatStartProps {
  /** What stands above the heading: the agent's orb at 64px. Decoration, hidden from screen readers. */
  readonly figure?: ReactNode;
  /** "Chat with Sorter", "What should we build?". */
  readonly heading: string;
  /** The heading's level under the page's own heading. Default 2. */
  readonly headingLevel?: 2 | 3;
  /** The line under it, muted: the agent's description, or the Assistant's start line. */
  readonly description?: string | undefined;
}

/**
 * What an empty chat shows before its first message, centred in the transcript's place: a figure,
 * the heading, and a muted line under it. The box under it is where the person starts, so it has
 * no button of its own.
 *
 * @example
 * <ChatStart figure={<Orb size={64} />} heading="Chat with Sorter" description="Sorts incoming mail by topic" />
 */
export function ChatStart({ figure, heading, headingLevel = 2, description }: ChatStartProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      {figure === undefined ? null : (
        <div aria-hidden="true" className="mb-2">
          {figure}
        </div>
      )}
      <Heading className="text-heading text-fg wrap-break-word">{heading}</Heading>
      {description === undefined || description === "" ? null : (
        <p className="max-w-reading text-body text-fg-muted wrap-break-word">{description}</p>
      )}
    </div>
  );
}
