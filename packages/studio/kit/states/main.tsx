import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StatesPage } from "./states-page.tsx";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The states page needs its #root element (states/index.html).");
}
createRoot(root).render(
  <StrictMode>
    <StatesPage only={new URLSearchParams(window.location.search).get("part")} />
  </StrictMode>,
);
