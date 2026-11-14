import { EmptyState } from "@halonicjs/studio-kit";
import { phoneWords } from "../run-words.ts";

/** What the Runs list and the run page show on a phone: one plain sentence (HAL-9390). */
export function RunsOnComputer() {
  return <EmptyState title={phoneWords.onComputer} plain />;
}
