import { Link } from "react-router-dom";
import sijilLogo from "@/assets/sijil-logo.png";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  href?: string;
};

export function Logo({ className, href }: LogoProps) {
  const content = (
    <>
      <img src={sijilLogo} alt="" className="h-9 w-9 object-contain" aria-hidden="true" />
      <span className="text-lg font-semibold tracking-tight text-foreground">SIJIL</span>
    </>
  );

  if (href) {
    return (
      <Link to={href} className={cn("flex items-center gap-2.5", className)}>
        {content}
      </Link>
    );
  }

  return <span className={cn("flex items-center gap-2.5", className)}>{content}</span>;
}
