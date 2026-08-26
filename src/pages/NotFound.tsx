import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { Logo } from "@/components/landing/Logo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PublicSurfaceLayout className="flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-8">
        <Logo />
      </div>
      <EmptyState
        icon={MapPinOff}
        title="Page not found"
        description={`We couldn't find a page at "${location.pathname}". The link may be outdated or the page may have moved.`}
        className="max-w-lg w-full"
      >
        <p className="mt-2 text-6xl font-bold tracking-tight text-primary/20" aria-hidden>
          404
        </p>
        <Button asChild className="mt-6 rounded-xl">
          <Link to="/">Return to home</Link>
        </Button>
      </EmptyState>
    </PublicSurfaceLayout>
  );
};

export default NotFound;
