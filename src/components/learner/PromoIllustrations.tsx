import { cn } from "@/lib/utils";

/** Isometric cube stack with checkmark — sidebar promo */
export function IdentityCubesIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 88 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-full w-full", className)}
      aria-hidden
    >
      {/* back block */}
      <path d="M44 8 L68 22 L68 46 L44 60 L20 46 L20 22 Z" fill="#0077B6" opacity="0.55" />
      <path d="M44 8 L68 22 L44 36 L20 22 Z" fill="#48CAE4" opacity="0.45" />
      {/* middle block */}
      <path d="M36 18 L58 30 L58 50 L36 62 L14 50 L14 30 Z" fill="#023E8A" />
      <path d="M36 18 L58 30 L36 42 L14 30 Z" fill="#0077B6" />
      <path d="M36 42 L58 30 L58 50 L36 62 Z" fill="#012A5C" />
      {/* front block with checkmark */}
      <path d="M48 28 L70 40 L70 58 L48 70 L26 58 L26 40 Z" fill="#0077B6" />
      <path d="M48 28 L70 40 L48 52 L26 40 Z" fill="#48CAE4" />
      <path d="M48 52 L70 40 L70 58 L48 70 Z" fill="#023E8A" />
      <path
        d="M42 48 L46 52 L54 42"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 3D shield — right-rail CTA */
export function VerifyShieldIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-14 w-14 shrink-0", className)}
      aria-hidden
    >
      <path
        d="M32 4 L56 14 V34 C56 48 44 60 32 66 C20 60 8 48 8 34 V14 L32 4Z"
        fill="#012A5C"
        stroke="#5EEAD4"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M32 10 L50 18 V33 C50 44 41 53 32 58 C23 53 14 44 14 33 V18 L32 10Z"
        fill="#023E8A"
        opacity="0.9"
      />
      <path
        d="M32 16 L44 22 V32 C44 39 38 44 32 47 C26 44 20 39 20 32 V22 L32 16Z"
        fill="#0077B6"
        opacity="0.35"
      />
      <path
        d="M32 4 L56 14 V34 C56 48 44 60 32 66"
        stroke="#2DD4BF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
