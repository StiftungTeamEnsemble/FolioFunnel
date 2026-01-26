"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, InputGroup, Textarea } from "@/components/ui";
import { createProject } from "@/app/actions/projects";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createProject(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result.project) {
      router.push(`/projects/${result.project.id}`);
    }
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Create Project</h1>
          <p className="page__subtitle">
            Set up a new document processing project
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: "600px" }}>
        <div className="card__body">
          {error && (
            <div style={{ color: "var(--color-error)", marginBottom: "16px" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="form">
            <InputGroup label="Project Name" htmlFor="name" required>
              <Input
                id="name"
                name="name"
                placeholder="My Document Project"
                required
              />
            </InputGroup>

            <InputGroup label="Description" htmlFor="description">
              <Textarea
                id="description"
                name="description"
                placeholder="What is this project about?"
                rows={3}
              />
            </InputGroup>

            <div className="form__actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={loading}>
                Create Project
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
