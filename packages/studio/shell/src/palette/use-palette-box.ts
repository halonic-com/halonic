import { useEffect, useRef, useState } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { PaletteContent, PaletteRow } from "./palette-groups.ts";
import { keptActive, movedActive, resultCountDelayMs, resultCountText } from "./palette-options.ts";

/**
 * The palette's active option, chosen again whenever the words or the options change: the first
 * one for new words, and for the same words the one the user moved to, when late results arrive.
 * The Ctrl K palette and the phone's Search sheet both keep theirs with it.
 */
export function useActiveOption(options: readonly PaletteRow[], words: string) {
  const [key, setKey] = useState<string | undefined>(options[0]?.key);
  const picked = useRef(false);
  const shownWords = useRef(words);
  const optionKeys = options.map((option) => option.key).join("\n");

  // `optionKeys` stands for `options`: a new array with the same rows changes nothing.
  useEffect(() => {
    const wordsChanged = shownWords.current !== words;
    shownWords.current = words;
    if (wordsChanged) {
      picked.current = false;
    }
    setKey((current) => keptActive(options, current, { wordsChanged, picked: picked.current }));
  }, [optionKeys, words]);

  return {
    row: options.find((option) => option.key === key),
    move(step: 1 | -1) {
      picked.current = true;
      setKey((current) => movedActive(options, current, step));
    },
  };
}

/** Says the count politely once the words have rested 500 ms and the providers have answered. */
export function useResultCount(
  announcer: Announcer,
  words: string,
  content: PaletteContent,
  searching: boolean,
) {
  const text = resultCountText(content);
  useEffect(() => {
    if (searching || words.trim() === "") {
      return;
    }
    const timer = setTimeout(() => announcer.announce(text), resultCountDelayMs);
    return () => clearTimeout(timer);
  }, [announcer, words, text, searching]);
}
