import { useState } from "react";

import { cn } from "@/lib/utils";

type CandidateAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
};

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";
}

export function CandidateAvatar({ name, avatarUrl, className }: CandidateAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(avatarUrl?.trim()) && !imageFailed;

  return (
    <div
      className={cn(
        "relative flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-border/80",
        !showPhoto && "bg-primary text-primary-foreground",
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={avatarUrl!}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-sm font-semibold">{initialsFromName(name)}</span>
      )}
    </div>
  );
}
