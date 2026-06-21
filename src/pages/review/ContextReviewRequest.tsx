import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default function ContextReviewRequest() {
  const { token = "" } = useParams();
  const [form, setForm] = useState<ReviewRequestFormView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(4);
  const [feedback, setFeedback] = useState("");
  const [recommendation, setRecommendation] = useState<ContextRecommendation>("Support");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Invalid review link");
      setLoading(false);
      return;
    }
    if (!isApiEnabled()) {
      setLoadError("Review service unavailable");
      setLoading(false);
      return;
    }
    getReviewRequestByTokenApi(token)
      .then(setForm)
      .catch((e: Error) => setLoadError(e.message || "Review link invalid or expired"))
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

  if (loadError || !form) {
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

  if (submitted) {
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

  const submit = async () => {
    if (!feedback.trim()) {
      toast({ title: "Feedback required", description: "Please share your observation for this context." });
      return;
    }
    try {
      await submitContextReviewApi(token, { rating, feedback, recommendation });
      setSubmitted(true);
      toast({ title: "Review submitted", description: "Stored as Context Verified Review." });
    } catch (e) {
      toast({
        title: "Submission failed",
        description: e instanceof Error ? e.message : "Could not submit review",
        variant: "destructive",
      });
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

      <Card>
        <CardHeader><CardTitle className="text-base">Review form</CardTitle></CardHeader>
        <CardContent className="space-y-4">
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
                  {RECOMMENDATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Feedback</Label>
              <Textarea
                className="mt-1.5"
                rows={4}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what you observed working with this learner in this project context."
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center text-amber-500 text-sm">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-4 w-4 ${i < rating ? "fill-current" : "opacity-30"}`} />
              ))}
            </div>
            <Button className="ml-auto" onClick={submit}>
              Submit review
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This review supports the evidence trail only. SIJIL does not assign skill levels or evaluation labels.
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm font-medium text-right">{v}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold">SIJIL</Link>
          <span className="text-xs text-muted-foreground">Context review form</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
