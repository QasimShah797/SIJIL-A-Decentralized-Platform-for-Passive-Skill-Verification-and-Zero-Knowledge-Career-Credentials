import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, CircleSlash, Star, MessageSquare, AlertTriangle } from "lucide-react";
import {
  findInvitation, updateInvitation, addPeerReview, verifyContributor,
  trustWeightFor, type Recommendation, type ReviewerRelationship, type PeerReview,
} from "@/lib/sijil-data";
import { toast } from "@/hooks/use-toast";

const RELATIONSHIPS: ReviewerRelationship[] = [
  "Teammate", "Project Collaborator", "Mentor", "Teacher", "Supervisor",
];
const RECOMMENDATIONS: Recommendation[] = ["Recommended", "Needs More Evidence", "Cannot Confirm"];

export default function ReviewInvite() {
  const { invitationId = "" } = useParams();
  const [inv, setInv] = useState(() => findInvitation(invitationId));
  const verification = useMemo(
    () => (inv ? verifyContributor(inv.projectId, inv.contributorId) : "Not a Project Contributor" as const),
    [inv],
  );

  const [relationship, setRelationship] = useState<ReviewerRelationship>(inv?.contributorRole ?? "Project Collaborator");
  const [rating, setRating] = useState<number>(4);
  const [comment, setComment] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation>("Recommended");
  const [submitted, setSubmitted] = useState(false);

  if (!inv) {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Invitation not found</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This review link is invalid or has expired.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (inv.status === "Completed" || submitted) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-success" /> Review submitted</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Thank you. Your review has been stored as a verified trust signal on {inv.learnerName}'s SIJIL profile.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const blocked = verification !== "Contributor Verified";

  const submit = () => {
    if (blocked) {
      toast({ title: "Submission blocked", description: "Only verified project contributors can submit a review.", variant: "destructive" });
      return;
    }
    if (!comment.trim()) {
      toast({ title: "Comment required", description: "Please describe your observation working with the learner." });
      return;
    }
    const rec: PeerReview = {
      id: `pr-${Date.now()}`,
      reviewerName: inv.contributorName,
      reviewerRole: relationship,
      source: inv.source,
      origin: "SIJIL",
      skill: inv.skill,
      projectId: inv.projectId,
      projectName: inv.projectName,
      evidenceLabel: `${inv.projectName} (${inv.source})`,
      rating: rating as 1 | 2 | 3 | 4 | 5,
      comment,
      recommendation,
      date: new Date().toISOString(),
      contextStatus: "Context Verified",
      contributorVerification: "Contributor Verified",
      trustWeight: trustWeightFor(relationship, true),
      imported: false,
    };
    addPeerReview(rec);
    updateInvitation(inv.id, { status: "Completed", completedReviewId: rec.id });
    setSubmitted(true);
    setInv({ ...inv, status: "Completed" });
    toast({ title: "Review submitted", description: "Stored as a context-verified trust signal." });
  };

  return (
    <Shell>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Peer review invitation</CardTitle>
          <p className="text-sm text-muted-foreground">
            You have been invited to review <span className="font-medium text-foreground">{inv.learnerName}</span> because you contributed to the same project.
          </p>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row k="Learner" v={inv.learnerName} />
          <Row k="Project" v={`${inv.projectName} (${inv.source})`} />
          <Row k="Linked evidence" v={inv.projectName} />
          <Row k="Skill / competency" v={inv.skill} />
          <Row k="Reviewer" v={`${inv.contributorName} · ${inv.contributorEmail ?? ""}`} />
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-muted-foreground">Reviewer status:</span>
            <StatusBadge
              variant={verification === "Contributor Verified" ? "verified" : "destructive"}
              icon={verification === "Contributor Verified" ? <ShieldCheck className="h-3 w-3" /> : <CircleSlash className="h-3 w-3" />}
            >
              {verification}
            </StatusBadge>
          </div>
          {blocked && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                You are not listed as a verified contributor of this project. Submission is blocked.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Review form</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Contributor relationship</Label>
              <Select value={relationship} onValueChange={(v) => setRelationship(v as ReviewerRelationship)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rating (1–5)</Label>
              <Select value={String(rating)} onValueChange={(v) => setRating(Number(v))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Recommendation</Label>
              <Select value={recommendation} onValueChange={(v) => setRecommendation(v as Recommendation)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECOMMENDATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Review comment</Label>
              <Textarea className="mt-1.5" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Describe what you observed working with this learner on this project." />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center text-amber-500 text-sm">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-4 w-4 ${i < rating ? "fill-current" : "opacity-30"}`} />
              ))}
            </div>
            <Button className="ml-auto" onClick={submit} disabled={blocked}>
              Submit review
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Reviews become trust signals on the learner's profile. SIJIL never shows expert/intermediate/beginner labels.
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
          <span className="text-xs text-muted-foreground">Peer review form</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
