import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyOverrides } from "./lib/uiOverrides";

// Apply persisted UI self-modifications before render so the page never flashes.
applyOverrides();

// Add global error handler
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; font-family: monospace; color: #ff0000; background: #1a1a1a; min-height: 100vh; overflow: auto;">
        <h1>⚠️ Critical Error</h1>
        <pre style="background: #2a2a2a; padding: 20px; border-radius: 4px; overflow: auto;">
          ${event.error?.stack || String(event.error)}
        </pre>
        <p>Check the browser console (F12) for more details.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
          Reload Page
        </button>
      </div>
    `;
  }
});

// Add rejection handler for promises
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  event.preventDefault();
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; font-family: monospace; color: #ff0000; background: #1a1a1a; min-height: 100vh; overflow: auto;">
        <h1>⚠️ Unhandled Promise Rejection</h1>
        <pre style="background: #2a2a2a; padding: 20px; border-radius: 4px; overflow: auto;">
          ${event.reason?.stack || String(event.reason)}
        </pre>
        <p>Check the browser console (F12) for more details.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
          Reload Page
        </button>
      </div>
    `;
  }
});

try {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Root element not found in HTML");
  }
  createRoot(root).render(<App />);
} catch (error) {
  console.error("Failed to mount app:", error);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; font-family: monospace; color: #ff0000; background: #1a1a1a; min-height: 100vh; overflow: auto;">
        <h1>⚠️ Failed to Mount Application</h1>
        <pre style="background: #2a2a2a; padding: 20px; border-radius: 4px; overflow: auto;">
          ${error instanceof Error ? error.stack : String(error)}
        </pre>
        <p>Check the browser console (F12) for more details.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
          Reload Page
        </button>
      </div>
    `;
  }
}
