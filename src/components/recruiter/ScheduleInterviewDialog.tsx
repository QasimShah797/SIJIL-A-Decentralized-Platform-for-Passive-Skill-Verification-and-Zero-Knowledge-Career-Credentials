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
  defaultInterviewDateTime,
  toDateTimeLocalValue,
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScheduledAt(defaultInterviewDateTime());
    setDurationMinutes("30");
    setMode(INTERVIEW_MODE.VIDEO_CALL);
    setLocationOrLink("");
    setNotes("");
  }, [open, candidateId]);

  const minDateTime = useMemo(() => toDateTimeLocalValue(new Date()), [open]);
  const locationLabel = INTERVIEW_LOCATION_LABELS[mode];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const localDate = new Date(scheduledAt);
    if (Number.isNaN(localDate.getTime())) {
      toast({ title: "Choose a valid date and time", variant: "destructive" });
      return;
    }
    if (localDate.getTime() < Date.now() - 60_000) {
      toast({ title: "Interview time must be in the future", variant: "destructive" });
      return;
    }
    if (locationOrLink.trim().length < 3) {
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
        scheduledAt: localDate.toISOString(),
        durationMinutes: Number(durationMinutes),
        mode,
        locationOrLink: locationOrLink.trim(),
        notes: notes.trim() || undefined,
      });
      const emailed = interview.emailStatus === "sent";
      toast({
        title: emailed ? "Interview scheduled" : "Interview saved — email not sent",
        description: emailed
          ? `Invitation emailed to ${interview.candidateEmail}.`
          : `Saved for ${candidateName}, but nothing was sent to Gmail. Add a Gmail App Password as SMTP_USER and SMTP_PASS in backend/.env, restart the backend, then schedule again.`,
        variant: emailed ? "default" : "destructive",
      });
      onOpenChange(false);
      onScheduled?.();
    } catch (err) {
      toast({
        title: "Could not schedule interview",
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
            Invite {candidateName} by email. They will receive the date, time, mode, and meeting details.
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
            <Label htmlFor="interview-location">{locationLabel}</Label>
            <Input
              id="interview-location"
              value={locationOrLink}
              onChange={(event) => setLocationOrLink(event.target.value)}
              placeholder={INTERVIEW_LOCATION_PLACEHOLDERS[mode]}
              required
            />
          </div>
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
