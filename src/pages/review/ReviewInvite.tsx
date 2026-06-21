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
import { ShieldCheck, MessageSquare, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  findInvitationByToken,
  markInvitationUsed,
  submitSecurePeerReview,
  invitationGithubUsername,
  type SecureReviewInvitation,
} from "@/lib/db/peer-reviews";

type PageState =
  | "loading"
  | "invalid"
  | "used"
  | "expired"
  | "identity_check"
  | "review_form"
  | "submitted";

const RECOMMENDATIONS = ["Recommended", "Needs More Evidence", "Cannot Confirm"];

export default function ReviewInvite() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState<PageState>("loading");
  const [invitation, setInvitation] = useState<SecureReviewInvitation | null>(null);

  const [enteredEmail, setEnteredEmail] = useState("");
  const [enteredGithubUsername, setEnteredGithubUsername] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);

  const [reviewText, setReviewText] = useState("");
  const [decision, setDecision] = useState("Recommended");
  const [confidence, setConfidence] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }

    findInvitationByToken(token)
      .then((inv) => {
        if (!inv) {
          setState("invalid");
          return;
        }
        if (inv.status === "used") {
          setState("used");
          return;
        }
        if (new Date(inv.expires_at).getTime() < Date.now()) {
          setState("expired");
          return;
        }
        setInvitation(inv);
        setState("identity_check");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const verifyIdentity = () => {
    if (!invitation) return;

    const invitedEmail = invitation.contributor_email?.trim().toLowerCase();
    const entered = enteredEmail?.trim().toLowerCase();
    const invitedGithub = invitationGithubUsername(invitation)
      ?.replace("@", "")
      .trim()
      .toLowerCase();
    const enteredGithub = enteredGithubUsername
      ?.replace("@", "")
      .trim()
      .toLowerCase();

    if (!invitedEmail && !invitedGithub) {
      toast({
        title: "Invalid invitation",
        description: "This invitation has no reviewer identity configured.",
        variant: "destructive",
      });
      return;
    }

    const emailMatch = Boolean(invitedEmail && entered && entered === invitedEmail);
    const githubMatch = Boolean(invitedGithub && enteredGithub && enteredGithub === invitedGithub);

    if (invitedEmail && invitedGithub) {
      if (!emailMatch && !githubMatch) {
        toast({
          title: "Not authorized",
          description: "This review link is only for the invited reviewer. Enter your invited email or GitHub username.",
          variant: "destructive",
        });
        return;
      }
    } else if (invitedEmail) {
      if (!emailMatch) {
        toast({
          title: "Not authorized",
          description: "This review link is only for the invited reviewer.",
          variant: "destructive",
        });
        return;
      }
    } else if (invitedGithub) {
      if (!githubMatch) {
        toast({
          title: "Not authorized",
          description: "This review link is only for the invited GitHub reviewer.",
          variant: "destructive",
        });
        return;
      }
    }

    setIdentityVerified(true);
    setState("review_form");
  };

  const submitReview = async () => {
    if (!invitation || !identityVerified) return;

    if (!reviewText.trim()) {
      toast({ title: "Review required", description: "Please describe your observation working with the learner." });
      return;
    }

    setSubmitting(true);
    try {
      const { data: freshInvitation, error: freshError } = await findInvitationByToken(token)
        .then((inv) => ({ data: inv, error: null }))
        .catch((e: Error) => ({ data: null, error: e }));

      if (freshError || !freshInvitation) {
        toast({
          title: "Invitation unavailable",
          description: "Could not verify invitation status.",
          variant: "destructive",
        });
        return;
      }

      if (freshInvitation.status === "used") {
        toast({
          title: "Already used",
          description: "This review link has already been used.",
          variant: "destructive",
        });
        setState("used");
        return;
      }

      if (!freshInvitation.learner_user_id) {
        toast({
          title: "Review submission failed",
          description: "Invitation is missing learner user id.",
          variant: "destructive",
        });
        return;
      }

      await submitSecurePeerReview(freshInvitation, {
        reviewText: reviewText.trim(),
        decision,
        confidence,
        reviewerEmail: enteredEmail || invitation.contributor_email || undefined,
        reviewerGithubUsername:
          enteredGithubUsername.replace("@", "")
          || invitationGithubUsername(invitation)
          || undefined,
      });

      await markInvitationUsed(freshInvitation.id);
      setState("submitted");
      toast({ title: "Review submitted", description: "Stored as a context-verified trust signal." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not submit review";
      toast({
        title: "Review submission failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "loading") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground text-center">
            Verifying review link…
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (state === "invalid") {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Invalid review link</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Invalid review link.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (state === "used") {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Link already used</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This review link has already been used.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (state === "expired") {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Link expired</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This review link has expired.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (state === "submitted") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" /> Review submitted
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Thank you. Your review has been stored as a verified trust signal on the learner&apos;s SIJIL profile.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!invitation) return null;

  const skillLabel = invitation.competency_name ?? "Skill claim";
  const projectLabel = invitation.project_name
    ? `${invitation.project_name}${invitation.source ? ` (${invitation.source})` : ""}`
    : "Project evidence";

  return (
    <Shell>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Peer review invitation
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            You have been invited to review{" "}
            <span className="font-medium text-foreground">
              {invitation.learner_name ?? "a learner"}
            </span>{" "}
            for their work on this project.
          </p>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row k="Project" v={projectLabel} />
          <Row k="Skill / competency" v={skillLabel} />
          {invitation.competency_domain && (
            <Row k="Domain" v={invitation.competency_domain} />
          )}
          {invitation.contributor_name && (
            <Row k="Invited reviewer" v={invitation.contributor_name} />
          )}
        </CardContent>
      </Card>

      {!identityVerified && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Verify your identity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Please verify your invited email or GitHub username before submitting this review.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {invitation.contributor_email && (
              <div>
                <Label>Invited email</Label>
                <Input
                  className="mt-1.5"
                  value={enteredEmail}
                  onChange={(e) => setEnteredEmail(e.target.value)}
                  placeholder="Enter your invited email"
                />
              </div>
            )}
            {invitationGithubUsername(invitation) && (
              <div>
                <Label>Invited GitHub username</Label>
                <Input
                  className="mt-1.5"
                  value={enteredGithubUsername}
                  onChange={(e) => setEnteredGithubUsername(e.target.value)}
                  placeholder="Enter your GitHub username"
                />
              </div>
            )}
            <Button onClick={verifyIdentity}>Continue to review form</Button>
          </CardContent>
        </Card>
      )}

      {identityVerified && state === "review_form" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review form</CardTitle>
            <p className="text-sm text-muted-foreground">
              Please verify your invited email or GitHub username before submitting this review.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Confidence (1–5)</Label>
                <Select value={String(confidence)} onValueChange={(v) => setConfidence(Number(v))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Decision</Label>
                <Select value={decision} onValueChange={setDecision}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECOMMENDATIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Review comment</Label>
                <Textarea
                  className="mt-1.5"
                  rows={4}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Describe what you observed working with this learner on this project."
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center text-amber-500 text-sm">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < confidence ? "fill-current" : "opacity-30"}`} />
                ))}
              </div>
              <Button className="ml-auto" onClick={() => void submitReview()} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit review"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Reviews become trust signals on the learner&apos;s profile. SIJIL never shows expert/intermediate/beginner labels.
            </p>
          </CardContent>
        </Card>
      )}
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
          <span className="text-xs text-muted-foreground">Peer review form</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
