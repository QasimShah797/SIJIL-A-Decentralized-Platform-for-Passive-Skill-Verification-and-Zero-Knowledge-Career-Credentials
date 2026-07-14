import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-8 sm:mb-10",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl text-left",
        className,
      )}
    >
      {eyebrow && (
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      )}
      <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.625rem]">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">{description}</p>
      )}
    </div>
  );
}
