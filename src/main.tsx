import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/learner-workspace.css";
import "./styles/sijil-brand.css";
import "./styles/auth-page.css";
import "./styles/practical-tasks-page.css";
import "./styles/validation-page.css";
import "./styles/peer-reviews-page.css";

const rootEl = document.getElementById("root")!;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("YOUR_PROJECT_REF")) {
  createRoot(rootEl).render(
    <div style={{ fontFamily: "Inter, sans-serif", maxWidth: 560, margin: "12vh auto", padding: 24 }}>
      <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12, color: "#64748b" }}>SIJIL</p>
      <h1 style={{ fontSize: 28, margin: "8px 0 12px" }}>Frontend env is missing</h1>
      <p style={{ lineHeight: 1.5, color: "#334155" }}>
        Copy <code>.env.example</code> to <code>.env.local</code>, set
        {" "}<code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart
        {" "}<code>npm run dev</code>.
      </p>
    </div>,
  );
} else {
  void import("./App.tsx").then(({ default: App }) => {
    createRoot(rootEl).render(<App />);
  });
}
