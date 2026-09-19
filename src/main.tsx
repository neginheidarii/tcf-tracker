import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyDevicePreference } from "./app/useTheme";
import "./styles/index.css";

applyDevicePreference();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* Ask the browser to treat the local cache as durable. Safari clears storage
   for sites you haven't opened in a week or so; installed apps are spared. */
if (navigator.storage?.persist) void navigator.storage.persist();
