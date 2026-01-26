"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, InputGroup } from "@/components/ui";

export default function SignInPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    router.push("/projects");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo">
          <div className="auth-card__logo-icon">FF</div>
          <span className="auth-card__logo-text">FolioFunnel</span>
        </div>

        <h1 className="auth-card__title">Welcome back</h1>
        <p className="auth-card__subtitle">
          Sign in to your account to continue
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

        <form onSubmit={handleSubmit} className="form">
          <InputGroup label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </InputGroup>

          <InputGroup label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
            />
          </InputGroup>

          <Button type="submit" fullWidth isLoading={loading}>
            Sign In
          </Button>
        </form>

        <div className="auth-card__footer">
          Don&apos;t have an account? <Link href="/auth/signup">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
