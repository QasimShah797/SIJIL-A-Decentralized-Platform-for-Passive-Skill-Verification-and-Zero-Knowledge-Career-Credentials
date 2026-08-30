import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/learner-workspace.css";
import "./styles/sijil-brand.css";
import "./styles/landing-page.css";
import "./styles/practical-tasks-page.css";
import "./styles/validation-page.css";

createRoot(document.getElementById("root")!).render(<App />);
