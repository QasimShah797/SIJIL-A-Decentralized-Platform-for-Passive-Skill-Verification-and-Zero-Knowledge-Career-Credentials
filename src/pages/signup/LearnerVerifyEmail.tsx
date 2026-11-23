import { useLocation } from "react-router-dom";
import { LearnerVerifyEmailForm } from "@/components/auth/LearnerVerifyEmailForm";

type LocationState = {
  email?: string;
};

export default function LearnerVerifyEmail() {
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;
  return <LearnerVerifyEmailForm initialEmail={state?.email ?? ""} />;
}
