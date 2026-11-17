import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import OverviewApp from "./components/OverviewApp";
import { isOverview } from "./backend";
import { lang, onLang } from "./i18n";
import "./index.css";
import "./theme";

// The window with the focus is fully in colour; the others step back (see `.inactive` in index.css).
// Not the overview: it is the radar beside the work and rarely has the focus
const focused = () => document.documentElement.classList.toggle("inactive", !isOverview && !document.hasFocus());
window.addEventListener("focus", focused);
window.addEventListener("blur", focused);
focused();

// The right mouse button belongs to CodeDeck (menus on commits and files will come), not to the
// web view's menu with Reload and Inspect. Text fields keep theirs for copy and paste, and so
// does selected text; Shift + right click still opens it, for the developer tools.
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  const editable = target.closest("input, textarea, [contenteditable=true]");
  const selection = window.getSelection()?.toString();
  if (!editable && !selection && !e.shiftKey) e.preventDefault();
});

/** The app, drawn anew in a new language: what lives outside the components (attachments) stays. */
function Root() {
  const [current, setCurrent] = useState(lang);
  useEffect(() => onLang(() => setCurrent(lang)), []);
  useEffect(() => void (document.documentElement.lang = current), [current]);
  // The overview of all projects is a window of its own without a project (docs/UEBERSICHT.md)
  return isOverview ? <OverviewApp key={current} /> : <App key={current} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
