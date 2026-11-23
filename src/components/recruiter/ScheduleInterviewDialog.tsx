import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { scheduleInterviewApi } from "@/services/api/interview.api";
import {
  INTERVIEW_DURATION_OPTIONS,
  INTERVIEW_LOCATION_LABELS,
  INTERVIEW_LOCATION_PLACEHOLDERS,
  INTERVIEW_MODE,
  INTERVIEW_MODE_LABELS,
  browserTimeZone,
  defaultInterviewDateTime,
  toDateTimeLocalValue,
  zonedDateTimeToIso,
  type InterviewMode,
} from "@/lib/interview";

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  onScheduled?: () => void;
}) {
  const [scheduledAt, setScheduledAt] = useState(() => defaultInterviewDateTime());
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [mode, setMode] = useState<InterviewMode>(INTERVIEW_MODE.VIDEO_CALL);
  const [locationOrLink, setLocationOrLink] = useState("");
  const [notes, setNotes] = useState("");
  const [timeZone, setTimeZone] = useState(() => browserTimeZone());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScheduledAt(defaultInterviewDateTime());
    setDurationMinutes("30");
    setMode(INTERVIEW_MODE.VIDEO_CALL);
    setLocationOrLink("");
    setNotes("");
    setTimeZone(browserTimeZone());
  }, [open, candidateId]);

  const minDateTime = useMemo(() => toDateTimeLocalValue(new Date()), [open]);
  const locationLabel = INTERVIEW_LOCATION_LABELS[mode];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const zone = timeZone.trim() || "UTC";
    let scheduledIso = "";
    try {
      scheduledIso = zonedDateTimeToIso(scheduledAt, zone);
    } catch {
      toast({ title: "Choose a valid timezone", variant: "destructive" });
      return;
    }
    const localDate = new Date(scheduledIso);
    if (Number.isNaN(localDate.getTime())) {
      toast({ title: "Choose a valid date and time", variant: "destructive" });
      return;
    }
    if (localDate.getTime() < Date.now() - 60_000) {
      toast({ title: "Interview time must be in the future", variant: "destructive" });
      return;
    }
    if (mode !== INTERVIEW_MODE.VIDEO_CALL && locationOrLink.trim().length < 3) {
      toast({
        title: `${locationLabel} is required`,
        description: "Add a location, meeting link, or dial-in details.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const interview = await scheduleInterviewApi({
        candidateId,
        scheduledAt: scheduledIso,
        durationMinutes: Number(durationMinutes),
        mode,
        locationOrLink:
          mode === INTERVIEW_MODE.VIDEO_CALL
            ? locationOrLink.trim() || undefined
            : locationOrLink.trim(),
        notes: notes.trim() || undefined,
        timeZone: zone,
      });
      if (interview.emailStatus === "sent") {
        toast({
          title: "Interview scheduled and invitation sent",
          description: "The email provider accepted the invitation.",
        });
      } else if (interview.emailStatus === "failed") {
        toast({
          title: "Interview scheduled, but the email was not sent",
          description: "The interview is saved. The email provider did not accept the invitation. Use a Gmail App Password for SMTP_USER and SMTP_PASS in backend/.env, restart the backend, then resend from Interviews.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Interview scheduled, but the email was not sent",
          description: "The interview is saved. Email delivery is not configured. Set SMTP_USER and SMTP_PASS in backend/.env, restart the backend, then resend from Interviews.",
          variant: "destructive",
        });
      }
      onOpenChange(false);
      onScheduled?.();
    } catch (err) {
      toast({
        title: "Interview scheduling failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
          <DialogDescription>
            Invite {candidateName} by email. Video calls get a Google Meet link from SIJIL automatically —
            recruiters do not need their own Google account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="interview-datetime">Date and time</Label>
            <Input
              id="interview-datetime"
              type="datetime-local"
              min={minDateTime}
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interview-duration">Duration</Label>
              <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                <SelectTrigger id="interview-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVIEW_DURATION_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interview-mode">Interview mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as InterviewMode)}>
                <SelectTrigger id="interview-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(INTERVIEW_MODE).map((value) => (
                    <SelectItem key={value} value={value}>
                      {INTERVIEW_MODE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-timezone">Timezone</Label>
            <Input
              id="interview-timezone"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              placeholder="Asia/Karachi"
              required
            />
            <p className="text-xs text-muted-foreground">
              The date and time above are read in this timezone. Example: Asia/Karachi or UTC.
            </p>
          </div>
          {mode === INTERVIEW_MODE.VIDEO_CALL ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              <Label htmlFor="interview-location" className="text-foreground">Meeting link</Label>
              <p id="interview-link-help" className="mt-1">
                Leave this blank to generate a Google Meet link with SIJIL, or enter your own meeting link.
              </p>
              <Input
                id="interview-location"
                aria-describedby="interview-link-help"
                type="url"
                className="mt-3"
                value={locationOrLink}
                onChange={(event) => setLocationOrLink(event.target.value)}
                placeholder="Optional override (leave blank for auto Meet)"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="interview-location">{locationLabel}</Label>
              <Input
                id="interview-location"
                value={locationOrLink}
                onChange={(event) => setLocationOrLink(event.target.value)}
                placeholder={INTERVIEW_LOCATION_PLACEHOLDERS[mode]}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="interview-notes">Notes (optional)</Label>
            <Textarea
              id="interview-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Agenda, interviewer names, or anything the candidate should prepare"
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Close
            </Button>
            <Button type="submit" disabled={submitting}>
              <CalendarClock className="mr-1.5 h-4 w-4" />
              {submitting ? "Scheduling…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
