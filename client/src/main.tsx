import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./reference-theme.css";
import "./phases-11-14.css";
import "./portal.css";
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .catch(() =>
        console.warn(
          "Offline page reload is unavailable; device drafts remain separate.",
        ),
      );
  });
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
