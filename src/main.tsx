import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles/globals.css";

// I defer pending updates until the tab is hidden to avoid interrupting active use.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const applyWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      document.removeEventListener("visibilitychange", applyWhenHidden);
      void updateSW(true);
    };
    if (document.visibilityState === "hidden") applyWhenHidden();
    else document.addEventListener("visibilitychange", applyWhenHidden);
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
