import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, Clock, FileText, Globe, Link2, MapPin, Video } from "lucide-react";
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
  const [meetingLinkMode, setMeetingLinkMode] = useState<"automatic" | "manual">("automatic");
  const [meetUnavailable, setMeetUnavailable] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [notes, setNotes] = useState("");
  const [timeZone, setTimeZone] = useState(() => browserTimeZone());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScheduledAt(defaultInterviewDateTime());
    setDurationMinutes("30");
    setMode(INTERVIEW_MODE.VIDEO_CALL);
    setLocationOrLink("");
    setMeetingLinkMode("automatic");
    setMeetingLink("");
    setMeetUnavailable(false);
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

    const interviewLocation = mode !== INTERVIEW_MODE.VIDEO_CALL
      ? locationOrLink.trim()
      : meetingLinkMode === "manual" ? meetingLink.trim() : undefined;

    setSubmitting(true);
    try {
      const interview = await scheduleInterviewApi({
        candidateId,
        scheduledAt: scheduledIso,
        durationMinutes: Number(durationMinutes),
        mode,
        locationOrLink: interviewLocation,
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
      if (mode === INTERVIEW_MODE.VIDEO_CALL && meetingLinkMode === "automatic" && err instanceof Error
        && /^(?:API 503: )?(?:Automatic Google Meet is unavailable|Google Calendar is not connected|Google Calendar (?:access expired|authorization failed|credentials are invalid))/i.test(err.message)) {
        setMeetUnavailable(true);
        setMeetingLinkMode("manual");
        return;
      }
      toast({
        title: "Interview scheduling failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const fieldLabel = "flex items-center gap-2.5 text-sm font-semibold text-[#112557] sm:text-base";
  const control = "h-11 rounded-xl border-slate-300 bg-white px-3.5 text-sm text-slate-950 sm:h-12 sm:text-base";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-950/65"
        className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] gap-5 overflow-y-auto rounded-2xl border-slate-200 bg-white p-5 shadow-2xl sm:max-w-2xl sm:gap-7 sm:p-8 [&>button]:right-5 [&>button]:top-5 [&>button]:bg-transparent [&>button]:text-[#112557] sm:[&>button]:right-7 sm:[&>button]:top-7 [&>button>svg]:size-5"
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-2xl font-bold text-[#112557] sm:text-3xl">Schedule Interview</DialogTitle>
          <DialogDescription className="sr-only">Send an interview invitation to {candidateName}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="interview-datetime" className={fieldLabel}><CalendarDays className="size-5 shrink-0" aria-hidden="true" />Date and time</Label>
            <Input
              id="interview-datetime"
              type="datetime-local"
              className={control}
              min={minDateTime}
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interview-duration" className={fieldLabel}><Clock className="size-5 shrink-0" aria-hidden="true" />Duration</Label>
              <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                <SelectTrigger id="interview-duration" className={control}>
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
              <Label htmlFor="interview-mode" className={fieldLabel}><Video className="size-5 shrink-0" aria-hidden="true" />Interview mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as InterviewMode)}>
                <SelectTrigger id="interview-mode" className={control}>
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
            <Label htmlFor="interview-timezone" className={fieldLabel}><Globe className="size-5 shrink-0" aria-hidden="true" />Timezone</Label>
            <Input
              id="interview-timezone"
              className={control}
              list="interview-timezones"
              aria-describedby="interview-timezone-help"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              placeholder="Asia/Karachi"
              required
            />
            <datalist id="interview-timezones">
              {[...new Set(["Asia/Karachi", "UTC", browserTimeZone()])].map((zone) => <option key={zone} value={zone} />)}
            </datalist>
            <p id="interview-timezone-help" className="text-sm text-slate-600">
              The date and time above are read in this timezone. Example: Asia/Karachi or UTC.
            </p>
          </div>
          {mode === INTERVIEW_MODE.VIDEO_CALL ? (
            <fieldset className="rounded-xl border border-blue-100 bg-blue-50 p-3.5 sm:p-4" aria-labelledby="interview-meeting-title">
              <div id="interview-meeting-title" className={fieldLabel}><Link2 className="size-5" aria-hidden="true" />Meeting link</div>
              <div className="mt-3 space-y-1">
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-950 sm:text-base ${meetingLinkMode === "automatic" ? "bg-blue-100" : ""}`}>
                  <input type="radio" name="interview-link-mode" value="automatic" checked={meetingLinkMode === "automatic"} onChange={() => setMeetingLinkMode("automatic")} className="size-4 shrink-0 accent-sijil-blue" />
                  Generate Google Meet link (recommended)
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-950 sm:text-base ${meetingLinkMode === "manual" ? "bg-blue-100" : ""}`}>
                  <input type="radio" name="interview-link-mode" value="manual" checked={meetingLinkMode === "manual"} onChange={() => setMeetingLinkMode("manual")} className="size-4 shrink-0 accent-sijil-blue" />
                  Enter my own meeting link
                </label>
              </div>
              {meetUnavailable && (
                <p className="mt-3 text-sm text-slate-700" role="alert">
                  Automatic Google Meet is unavailable. Enter a meeting URL to send the invitation.
                </p>
              )}
              {meetingLinkMode === "manual" && (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="interview-meeting-url" className={fieldLabel}>Meeting URL</Label>
                  <Input id="interview-meeting-url" required type="url" className={control} value={meetingLink} onChange={(event) => setMeetingLink(event.target.value)} placeholder="https://" />
                </div>
              )}
            </fieldset>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="interview-location" className={fieldLabel}><MapPin className="size-5" aria-hidden="true" />{locationLabel}</Label>
              <Input
                id="interview-location"
                className={control}
                value={locationOrLink}
                onChange={(event) => setLocationOrLink(event.target.value)}
                placeholder={INTERVIEW_LOCATION_PLACEHOLDERS[mode]}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="interview-notes" className={fieldLabel}><FileText className="size-5 shrink-0" aria-hidden="true" />Notes (optional)</Label>
            <Textarea
              id="interview-notes"
              className="min-h-24 rounded-xl border-slate-300 bg-white p-3.5 text-slate-950 placeholder:text-slate-500 sm:text-base"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Agenda, interviewer names, or anything the learner should prepare"
              maxLength={2000}
            />
          </div>
          <DialogFooter className="gap-2 pt-2 sm:gap-3 sm:space-x-0 sm:pt-4">
            <Button type="button" variant="outline" className="h-11 rounded-xl border-sijil-blue px-6 font-semibold text-sijil-blue" onClick={() => onOpenChange(false)} disabled={submitting}>
              Close
            </Button>
            <Button type="submit" disabled={submitting} className="h-11 rounded-xl bg-sijil-blue px-6 font-semibold text-white hover:bg-sijil-blue/90">
              <CalendarClock className="mr-1.5 h-4 w-4" />
              {submitting ? "Scheduling…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
