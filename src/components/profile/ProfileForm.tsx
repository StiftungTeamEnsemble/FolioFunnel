"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, InputGroup } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { updateProfile } from "@/app/actions/users";

interface ProfileFormProps {
  name: string | null;
  email: string;
}

export function ProfileForm({ name, email }: ProfileFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [formState, setFormState] = useState({
    name: name ?? "",
    email,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const formData = new FormData(event.currentTarget);
    const result = await updateProfile(formData);

    if (result.error) {
      toast({
        type: "error",
        title: "Unable to update profile",
        description: result.error,
      });
      setIsSaving(false);
      return;
    }

    if (result.user) {
      setFormState({
        name: result.user.name ?? "",
        email: result.user.email,
      });
    }

    toast({
      type: "success",
      title: "Profile updated",
      description: "Your changes have been saved.",
    });
    router.refresh();
    setIsSaving(false);
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <InputGroup label="Name" htmlFor="name" hint="Optional">
        <Input
          id="name"
          name="name"
          value={formState.name}
          placeholder="Your name"
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, name: event.target.value }))
          }
        />
      </InputGroup>

      <InputGroup label="Email" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          required
          value={formState.email}
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, email: event.target.value }))
          }
        />
      </InputGroup>

      <div className="form__actions">
        <Button type="submit" isLoading={isSaving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
