import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, MessageSquare, Star, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  getReviewRequestByTokenApi,
  submitContextReviewApi,
  type ContextRecommendation,
  type ReviewRequestFormView,
} from "@/services/api/reviews.api";
import { isApiEnabled } from "@/services/api/client";

const RECOMMENDATIONS: ContextRecommendation[] = [
  "Support", "Needs More Evidence", "Not Enough Context",
];

type PageState = "loading" | "error" | "identity_check" | "review_form" | "submitted";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeGithub(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function verifyInviteIdentity(
  form: ReviewRequestFormView,
  enteredEmail: string,
  enteredGithub: string,
): boolean {
  const invitedEmail = normalizeEmail(form.invitedReviewerEmail ?? "");
  const invitedGithub = normalizeGithub(form.invitedGithubLogin ?? "");
  const email = normalizeEmail(enteredEmail);
  const github = normalizeGithub(enteredGithub);

  if (!invitedEmail && !invitedGithub) {
    toast({
      title: "Invalid invitation",
      description: "This invitation has no reviewer identity configured.",
      variant: "destructive",
    });
    return false;
  }

  const emailMatch = Boolean(invitedEmail && email && email === invitedEmail);
  const githubMatch = Boolean(invitedGithub && github && github === invitedGithub);

  if (invitedEmail && invitedGithub) {
    if (!emailMatch && !githubMatch) {
      toast({
        title: "Not authorized",
        description: "This review link is only for the invited contributor. Enter your invited email or GitHub username.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  if (invitedEmail && !emailMatch) {
    toast({
      title: "Not authorized",
      description: "This review link is only for the invited contributor email.",
      variant: "destructive",
    });
    return false;
  }

  if (invitedGithub && !githubMatch) {
    toast({
      title: "Not authorized",
      description: "This review link is only for the invited GitHub contributor.",
      variant: "destructive",
    });
    return false;
  }

  return true;
}

export default function ContextReviewRequest() {
  const { token = "" } = useParams();
  const [form, setForm] = useState<ReviewRequestFormView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [enteredEmail, setEnteredEmail] = useState("");
  const [enteredGithub, setEnteredGithub] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);
  const [rating, setRating] = useState(4);
  const [feedback, setFeedback] = useState("");
  const [recommendation, setRecommendation] = useState<ContextRecommendation>("Support");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Invalid review link");
      setPageState("error");
      setLoading(false);
      return;
    }
    if (!isApiEnabled()) {
      setLoadError("Review service unavailable");
      setPageState("error");
      setLoading(false);
      return;
    }
    getReviewRequestByTokenApi(token)
      .then((next) => {
        setForm(next);
        setPageState("identity_check");
      })
      .catch((e: Error) => {
        setLoadError(e.message || "Review link invalid or expired");
        setPageState("error");
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground text-center">
            Loading review form…
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (pageState === "error" || !form) {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Review link unavailable</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loadError ?? "This review link is invalid or has expired."}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (pageState === "submitted") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" /> Review submitted
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Thank you. Your feedback has been stored as a Context Verified Review on {form.learnerName}'s SIJIL evidence trail.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const verifyIdentity = () => {
    if (!verifyInviteIdentity(form, enteredEmail, enteredGithub)) return;
    setIdentityVerified(true);
    setPageState("review_form");
  };

  const submit = async () => {
    if (!feedback.trim()) {
      toast({ title: "Feedback required", description: "Please share your observation for this context." });
      return;
    }
    if (!identityVerified && !verifyInviteIdentity(form, enteredEmail, enteredGithub)) {
      return;
    }

    setSubmitting(true);
    try {
      await submitContextReviewApi(token, {
        rating,
        feedback,
        recommendation,
        reviewerEmail: enteredEmail.trim() || undefined,
        reviewerGithubUsername: enteredGithub.trim() || undefined,
      });
      setPageState("submitted");
      toast({ title: "Review submitted", description: "Stored as Context Verified Review." });
    } catch (e) {
      toast({
        title: "Submission failed",
        description: e instanceof Error ? e.message : "Could not submit review",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Context review request
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            You have been invited to review evidence for{" "}
            <span className="font-medium text-foreground">{form.learnerName}</span>{" "}
            because you share the same project context.
          </p>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row k="Learner" v={form.learnerName} />
          <Row k="Declared skill claim" v={form.skillClaim} />
          <Row k="Evidence / project" v={form.evidenceName} />
          <Row k="Context source" v={form.contextSource} />
          <Row k="Your context" v={form.reviewerContext} />
          <Row k="Reviewer" v={form.reviewerName} />
        </CardContent>
      </Card>

      {pageState === "identity_check" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Verify your identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This secure link is bound to the invited project contributor. Confirm your invited email or GitHub username before submitting a review.
            </p>
            <div>
              <Label>Invited email</Label>
              <Input
                className="mt-1.5"
                value={enteredEmail}
                onChange={(e) => setEnteredEmail(e.target.value)}
                placeholder="reviewer@example.com"
              />
            </div>
            <div>
              <Label>GitHub username</Label>
              <Input
                className="mt-1.5"
                value={enteredGithub}
                onChange={(e) => setEnteredGithub(e.target.value)}
                placeholder="contributor-login"
              />
            </div>
            <Button onClick={verifyIdentity}>
              Continue to review form
            </Button>
          </CardContent>
        </Card>
      )}

      {pageState === "review_form" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Review form</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              Only the invited contributor can submit this review. Your identity is checked again on submission.
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Rating (1–5)</Label>
                <Select value={String(rating)} onValueChange={(v) => setRating(Number(v))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recommendation</Label>
                <Select value={recommendation} onValueChange={(v) => setRecommendation(v as ContextRecommendation)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECOMMENDATIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Feedback</Label>
              <Textarea
                className="mt-1.5 min-h-[120px]"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what you observed in this shared project context."
              />
            </div>
            <Button onClick={() => void submit()} disabled={submitting}>
              Submit review
            </Button>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="font-semibold">SIJIL · Context review</div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Home</Link>
      </div>
      <div className="max-w-2xl mx-auto p-6">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-36 shrink-0">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
