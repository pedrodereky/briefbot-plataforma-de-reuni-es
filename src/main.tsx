import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { iniciarTelemetria } from "@/lib/telemetry";
import "./index.css";

// Não bloqueia a montagem: sem VITE_SENTRY_DSN isto resolve na hora e o SDK
// nem chega a ser baixado.
void iniciarTelemetria();

createRoot(document.getElementById("root")!).render(<App />);
