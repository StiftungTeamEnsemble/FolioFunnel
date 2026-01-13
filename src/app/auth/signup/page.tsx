'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, InputGroup } from '@/components/ui';
import { signUp } from '@/app/actions/auth';

export default function SignUpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await signUp(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push('/auth/signin?registered=true');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo">
          <div className="auth-card__logo-icon">FF</div>
          <span className="auth-card__logo-text">FolioFunnel</span>
        </div>

        <h1 className="auth-card__title">Create an account</h1>
        <p className="auth-card__subtitle">Get started with FolioFunnel</p>

        {error && (
          <div style={{ color: 'var(--color-error)', textAlign: 'center', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          <InputGroup label="Name" htmlFor="name">
            <Input
              id="name"
              name="name"
              placeholder="Your name"
            />
          </InputGroup>

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
              minLength={8}
              required
            />
          </InputGroup>

          <Button type="submit" fullWidth isLoading={loading}>
            Sign Up
          </Button>
        </form>

        <div className="auth-card__footer">
          Already have an account?{' '}
          <Link href="/auth/signin">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
