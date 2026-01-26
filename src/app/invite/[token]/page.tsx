"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui";
import { acceptInvite } from "@/app/actions/projects";

interface InvitePageProps {
  params: { token: string };
}

export default function InvitePage({ params }: InvitePageProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    const result = await acceptInvite(params.token);

    if (result.error) {
      setError(result.error);
      if (result.projectId) {
        // Already a member, redirect
        setTimeout(() => {
          router.push(`/projects/${result.projectId}`);
        }, 2000);
      }
      setLoading(false);
      return;
    }

    if (result.success && result.projectId) {
      setSuccess({
        projectId: result.projectId,
        projectName: result.projectName || "Project",
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/auth/signin?callbackUrl=/invite/${params.token}`);
    }
  }, [status, params.token, router]);

  if (status === "loading") {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-card__logo">
            <div className="auth-card__logo-icon">FF</div>
            <span className="auth-card__logo-text">FolioFunnel</span>
          </div>
          <p style={{ textAlign: "center" }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-card__logo">
            <div className="auth-card__logo-icon">FF</div>
            <span className="auth-card__logo-text">FolioFunnel</span>
          </div>
          <h1 className="auth-card__title">Welcome!</h1>
          <p className="auth-card__subtitle">
            You&apos;ve joined {success.projectName}
          </p>
          <Button
            fullWidth
            onClick={() => router.push(`/projects/${success.projectId}`)}
          >
            Go to Project
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo">
          <div className="auth-card__logo-icon">FF</div>
          <span className="auth-card__logo-text">FolioFunnel</span>
        </div>

        <h1 className="auth-card__title">Project Invitation</h1>
        <p className="auth-card__subtitle">
          You&apos;ve been invited to join a project
        </p>

        {error && (
          <div
            style={{
              color: "var(--color-error)",
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        )}

        <Button fullWidth isLoading={loading} onClick={handleAccept}>
          Accept Invitation
        </Button>

        <div className="auth-card__footer">
          Signed in as {session?.user?.email}
        </div>
      </div>
    </div>
  );
}
