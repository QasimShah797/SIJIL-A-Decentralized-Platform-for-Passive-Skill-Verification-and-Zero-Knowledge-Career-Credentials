import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireInstitutionRoute } from "@/components/RequireInstitutionRoute";
import { RequireLearnerRoute } from "@/components/RequireLearnerRoute";
import { RequireRecruiterRoute } from "@/components/RequireRecruiterRoute";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
import AuthEntry from "./pages/auth/AuthEntry";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import ReviewInvite from "./pages/review/ReviewInvite";
import ContextReviewRequest from "./pages/review/ContextReviewRequest";
import InstitutionLogin from "./pages/login/InstitutionLogin";
import LearnerLogin from "./pages/login/LearnerLogin";
import LearnerSignup from "./pages/signup/LearnerSignup";
import ActivateAccount from "./pages/student/ActivateAccount";
import CompleteProfile from "./pages/learner/CompleteProfile";
import LearnerProfile from "./pages/learner/Profile";
import MyProfile from "./pages/learner/MyProfile";
import LearnerIntegrations from "./pages/learner/Integrations";
import LearnerPracticalTask from "./pages/learner/PracticalTask";
import LearnerValidation from "./pages/learner/Validation";
import LearnerWallet from "./pages/learner/WalletPage";
import LearnerPeerReviews from "./pages/learner/PeerReviews";
import LearnerCredentialDetails from "./pages/learner/CredentialDetails";
import LearnerCredentialProof from "./pages/learner/CredentialProof";
import LearnerSelectiveDisclosure from "./pages/learner/SelectiveDisclosure";
import InstitutionDashboard from "./pages/institution/Dashboard";
import InstitutionAttestationQueue from "./pages/institution/AttestationQueue";
import InstitutionAttestationDetail from "./pages/institution/AttestationDetail";
import InstitutionAttestationRequestDetail from "./pages/institution/AttestationRequestDetail";
import InstitutionValidationTrail from "./pages/institution/ValidationTrail";
import StudentManagement from "./pages/institution/StudentManagement";
import GitHubPrepare from "./pages/auth/GitHubPrepare";
import GitHubCallback from "./pages/auth/GitHubCallback";
import CompetencyPresentationView from "./pages/public/CompetencyPresentationView";
import RecruiterLogin from "./pages/login/RecruiterLogin";
import RecruiterSearch from "./pages/recruiter/Search";
import RecruiterCandidateSummary from "./pages/recruiter/CandidateSummary";
import RecruiterCompare from "./pages/recruiter/Compare";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 30,
      retry: 1,
    },
  },
});

const RR = ({ children }: { children: React.ReactNode }) => (
  <RequireRecruiterRoute>{children}</RequireRecruiterRoute>
);

const IR = ({ children }: { children: React.ReactNode }) => (
  <RequireInstitutionRoute>{children}</RequireInstitutionRoute>
);

const LR = ({ children }: { children: React.ReactNode }) => (
  <RequireLearnerRoute>{children}</RequireLearnerRoute>
);

const LRIncomplete = ({ children }: { children: React.ReactNode }) => (
  <RequireLearnerRoute requireCompleteProfile={false}>{children}</RequireLearnerRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthEntry />} />
          <Route path="/about" element={<Landing />} />

          <Route path="/login/institution" element={<InstitutionLogin />} />
          <Route path="/login/learner" element={<LearnerLogin />} />
          <Route path="/signup/learner" element={<LearnerSignup />} />
          <Route path="/login/recruiter" element={<RecruiterLogin />} />
          <Route path="/student/activate" element={<ActivateAccount />} />

          <Route path="/review/invite/:token" element={<ReviewInvite />} />
          <Route path="/review/request/:token" element={<ContextReviewRequest />} />

          <Route path="/auth/github/prepare" element={<LRIncomplete><GitHubPrepare /></LRIncomplete>} />
          <Route path="/auth/github/callback" element={<GitHubCallback />} />

          <Route path="/learner/complete-profile" element={<LRIncomplete><CompleteProfile /></LRIncomplete>} />
          <Route path="/learner/profile" element={<LR><LearnerProfile /></LR>} />
          <Route path="/learner/my-profile" element={<LR><MyProfile /></LR>} />
          <Route path="/learner/integrations" element={<LR><LearnerIntegrations /></LR>} />
          <Route path="/learner/task" element={<LR><LearnerPracticalTask /></LR>} />
          <Route path="/learner/validation" element={<LR><LearnerValidation /></LR>} />
          <Route path="/learner/validation/:skillId" element={<LR><LearnerValidation /></LR>} />
          <Route path="/learner/wallet" element={<LR><LearnerWallet /></LR>} />
          <Route path="/learner/peer-reviews" element={<LR><LearnerPeerReviews /></LR>} />
          <Route path="/learner/credential/:id" element={<LR><LearnerCredentialDetails /></LR>} />
          <Route path="/learner/credential/:id/proof" element={<LR><LearnerCredentialProof /></LR>} />
          <Route path="/learner/credential/:id/share" element={<LR><LearnerSelectiveDisclosure /></LR>} />

          <Route path="/recruiter/search" element={<RR><RecruiterSearch /></RR>} />
          <Route path="/recruiter/candidate/:id" element={<RR><RecruiterCandidateSummary /></RR>} />
          <Route path="/recruiter/compare" element={<RR><RecruiterCompare /></RR>} />
          <Route path="/recruiter/verify/:token" element={<CompetencyPresentationView />} />

          <Route path="/institution" element={<IR><Navigate to="/institution/dashboard" replace /></IR>} />
          <Route path="/institution/dashboard" element={<IR><InstitutionDashboard /></IR>} />
          <Route path="/institution/students" element={<IR><StudentManagement /></IR>} />
          <Route path="/institution/queue" element={<IR><InstitutionAttestationQueue /></IR>} />
          <Route path="/institution/attestation" element={<IR><InstitutionAttestationDetail /></IR>} />
          <Route path="/institution/attestation/:id" element={<IR><InstitutionAttestationDetail /></IR>} />
          <Route path="/institution/attestation-request/:id" element={<IR><InstitutionAttestationRequestDetail /></IR>} />
          <Route path="/institution/attestation/:id/validation" element={<IR><InstitutionValidationTrail /></IR>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
