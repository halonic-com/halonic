import { useEffect } from "react";
import { ShellFrame } from "../frame/shell-frame.tsx";
import type { Shell } from "../shell.ts";
import { appName } from "../window/window-title.ts";
import { Welcome, type WelcomeProps } from "./welcome.tsx";

/** Props for {@link WelcomeWindow}. */
export interface WelcomeWindowProps extends WelcomeProps {
  /** The window's announcer, close stack, engine and toasts. */
  readonly shell: Shell;
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
}

/**
 * The Studio window with no workspace open: the {@link Welcome} screen in the shell's frame, with
 * no title bar tabs, toolbar, sidebar or status bar, so there's nothing to use before a folder is
 * open. The toasts still show, so a workspace closed from here leaves its messages. The window
 * title is the app's name alone, as no page or workspace is shown.
 *
 * @example
 * <WelcomeWindow shell={shell} language="en" onOpenFolder={openFolder} />
 */
export function WelcomeWindow({ shell, language, onOpenFolder }: WelcomeWindowProps) {
  useEffect(() => {
    document.title = appName;
  }, []);
  return (
    <ShellFrame
      announcer={shell.announcer}
      closeStack={shell.closeStack}
      engine={shell.engine}
      toasts={shell.toasts}
      language={language}
    >
      <Welcome onOpenFolder={onOpenFolder} />
    </ShellFrame>
  );
}
