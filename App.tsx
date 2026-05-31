import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/RequireAuth";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import SignupChooser from "./pages/SignupChooser";
import LearnerSignup from "./pages/signup/LearnerSignup";
import RecruiterSignup from "./pages/signup/RecruiterSignup";
import InstitutionSignup from "./pages/signup/InstitutionSignup";
import GitHubCallback from "./pages/auth/GitHubCallback";
import LearnerProfile from "./pages/learner/Profile";
import Integrations from "./pages/learner/Integrations";
import PracticalTask from "./pages/learner/PracticalTask";
import Validation from "./pages/learner/Validation";
import WalletPage from "./pages/learner/WalletPage";
import PeerReviews from "./pages/learner/PeerReviews";
import CredentialDetails from "./pages/learner/CredentialDetails";
import CredentialProof from "./pages/learner/CredentialProof";
import SelectiveDisclosure from "./pages/learner/SelectiveDisclosure";
import RecruiterSearch from "./pages/recruiter/Search";
import CandidateSummary from "./pages/recruiter/CandidateSummary";
import RecruiterCompare from "./pages/recruiter/Compare";
import RecruiterCredentialView from "./pages/recruiter/CredentialView";
import InstitutionDashboard from "./pages/institution/Dashboard";
import AttestationQueue from "./pages/institution/AttestationQueue";
import AttestationDetail from "./pages/institution/AttestationDetail";
import InstitutionValidationTrail from "./pages/institution/ValidationTrail";
import ReviewInvite from "./pages/review/ReviewInvite";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignupChooser />} />
            <Route path="/signup/learner" element={<LearnerSignup />} />
            <Route path="/signup/recruiter" element={<RecruiterSignup />} />
            <Route path="/signup/institution" element={<InstitutionSignup />} />
            <Route path="/register" element={<SignupChooser />} />
            <Route path="/review/:invitationId" element={<ReviewInvite />} />
            <Route path="/auth/github/callback" element={<RequireAuth><GitHubCallback /></RequireAuth>} />

            <Route path="/learner/profile" element={<RequireAuth><LearnerProfile /></RequireAuth>} />
            <Route path="/learner/integrations" element={<RequireAuth><Integrations /></RequireAuth>} />
            <Route path="/learner/task" element={<RequireAuth><PracticalTask /></RequireAuth>} />
            <Route path="/learner/validation/:skillId" element={<RequireAuth><Validation /></RequireAuth>} />
            <Route path="/learner/wallet" element={<RequireAuth><WalletPage /></RequireAuth>} />
            <Route path="/learner/peer-reviews" element={<RequireAuth><PeerReviews /></RequireAuth>} />
            <Route path="/learner/credential/:id" element={<RequireAuth><CredentialDetails /></RequireAuth>} />
            <Route path="/learner/credential/:id/proof" element={<RequireAuth><CredentialProof /></RequireAuth>} />
            <Route path="/learner/credential/:id/share" element={<RequireAuth><SelectiveDisclosure /></RequireAuth>} />

            <Route path="/recruiter/search" element={<RequireAuth><RecruiterSearch /></RequireAuth>} />
            <Route path="/recruiter/candidate/:id" element={<RequireAuth><CandidateSummary /></RequireAuth>} />
            <Route path="/recruiter/compare" element={<RequireAuth><RecruiterCompare /></RequireAuth>} />
            <Route path="/recruiter/verify/:token" element={<RequireAuth><RecruiterCredentialView /></RequireAuth>} />

            <Route path="/institution" element={<RequireAuth><InstitutionDashboard /></RequireAuth>} />
            <Route path="/institution/dashboard" element={<RequireAuth><InstitutionDashboard /></RequireAuth>} />
            <Route path="/institution/queue" element={<RequireAuth><AttestationQueue /></RequireAuth>} />
            <Route path="/institution/attestation" element={<RequireAuth><AttestationQueue /></RequireAuth>} />
            <Route path="/institution/attestation/:id" element={<RequireAuth><AttestationDetail /></RequireAuth>} />
            <Route path="/institution/attestation/:id/validation" element={<RequireAuth><InstitutionValidationTrail /></RequireAuth>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
