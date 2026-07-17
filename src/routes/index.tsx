import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">…</div>;
  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
}
