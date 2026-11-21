import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { type CardStack, noCards, openCard } from "../../src/cards/card-stack.ts";
import { StackedCards } from "../../src/cards/stacked-cards.tsx";
import { createCloseStack } from "../../src/close-stack/close-stack.ts";

/**
 * Agent "Writer" in "Acme Mail" with the cards named in the page's `cards` query parameter open,
 * comma-separated ("draft-reply" if none), filling the window, for the card's header at a phone's
 * width and a desktop's in a real browser.
 */
function AgentPage() {
  const titles = (new URLSearchParams(location.search).get("cards") ?? "draft-reply").split(",");
  const [stack, setStack] = useState<CardStack>(
    titles.reduce((cards, title) => openCard(cards, { key: `part/${title}`, title }), noCards),
  );
  const [closeStack] = useState(createCloseStack);
  return (
    <div className="h-screen">
      <StackedCards
        itemPath={["Acme Mail", "Writer"]}
        stack={stack}
        onChange={setStack}
        closeStack={closeStack}
        panelWidth={window.innerWidth}
        renderCard={() => <p className="p-4">The card's body.</p>}
      >
        <p>The agent's map.</p>
      </StackedCards>
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The stacked cards page needs its #root element (stacked-cards.html).");
}
createRoot(root).render(
  <StrictMode>
    <AgentPage />
  </StrictMode>,
);
