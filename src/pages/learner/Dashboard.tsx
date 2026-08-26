import { Navigate } from "react-router-dom";

/** Legacy route — overview lives at /learner/profile */
export default function LearnerDashboard() {
  return <Navigate to="/learner/profile" replace />;
}
