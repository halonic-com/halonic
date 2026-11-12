import { usePresentation } from "@halonicjs/studio-kit";
import { type HomeCardProps, HomeSectionEmpty } from "@halonicjs/studio-shell";
import { type ComponentType, useSyncExternalStore } from "react";
import { PluginCard } from "./plugin-card.tsx";
import type { PluginHomeCardsOptions } from "./plugin-home-cards.ts";

/** Home's Cards view for the Studio's plugins; see `pluginHomeCards`. */
export function homeCardsView(
  optionsFor: (context: HomeCardProps["context"]) => PluginHomeCardsOptions,
): ComponentType<HomeCardProps> {
  return function PluginHomeCards({ context }: HomeCardProps) {
    return <HomeCards {...optionsFor(context)} />;
  };
}

function HomeCards({ feed, caller, review, details }: PluginHomeCardsOptions) {
  const plugins = useSyncExternalStore(feed.subscribe, feed.current);
  const phone = usePresentation() === "phone";
  const cards = plugins.flatMap((plugin) => plugin.cards.map((card) => ({ plugin, card })));
  if (cards.length === 0) return <HomeSectionEmpty />;
  return (
    <div className={phone ? "grid gap-2 px-4" : "grid grid-cols-2 gap-2"}>
      {cards.map(({ plugin, card }) => (
        <PluginCard
          key={`${plugin.plugin}.${card.id}`}
          plugin={{ id: plugin.plugin, name: plugin.name }}
          status={plugin.status}
          card={card}
          caller={caller}
          onReview={() => review(plugin.plugin)}
          onDetails={() => details(plugin.plugin)}
        />
      ))}
    </div>
  );
}
