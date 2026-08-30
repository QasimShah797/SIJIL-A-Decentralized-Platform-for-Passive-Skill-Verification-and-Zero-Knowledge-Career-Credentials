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
      <img src={sijilLogo} alt="" className="h-8 w-8 rounded-lg object-contain" aria-hidden="true" />
      <span className="text-lg font-bold tracking-tight text-gray-900">SIJIL</span>
    </>
  );

  if (href) {
    return (
      <Link to={href} className={cn("flex items-center gap-2", className)}>
        {content}
      </Link>
    );
  }

  return <span className={cn("flex items-center gap-2", className)}>{content}</span>;
}
