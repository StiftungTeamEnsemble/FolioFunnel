"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MemberRole,
  Project,
  ProjectMembership,
  ProjectInvite,
} from "@prisma/client";
import {
  Button,
  Input,
  InputGroup,
  Select,
  SelectItem,
  Textarea,
} from "@/components/ui";
import { ArrayValueEditor } from "@/components/documents/ArrayValueEditor";
import {
  addProjectMember,
  removeMember,
  updateProject,
} from "@/app/actions/projects";

interface MemberWithUser extends ProjectMembership {
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

interface ProjectEditClientProps {
  project: Project & { resultTags: string[] };
  members: MemberWithUser[];
  pendingInvites: ProjectInvite[];
  currentUserId: string;
}

const roleLabels: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function ProjectEditClient({
  project,
  members,
  pendingInvites,
  currentUserId,
}: ProjectEditClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"admin" | "member">("member");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [resultTags, setResultTags] = useState<string[]>(
    project.resultTags || [],
  );
  const currentMemberRole =
    members.find((member) => member.user.id === currentUserId)?.role ??
    MemberRole.member;

  useEffect(() => {
    setResultTags(project.resultTags || []);
  }, [project.resultTags]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const formData = new FormData(event.currentTarget);
    const result = await updateProject(project.id, formData);

    if (result.error) {
      setSaveError(result.error);
      setSaving(false);
      return;
    }

    setSaveSuccess("Project details updated.");
    setSaving(false);
    router.refresh();
  };

  const handleShare = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSharing(true);
    setShareError(null);
    setShareSuccess(null);

    const formData = new FormData(event.currentTarget);
    const result = await addProjectMember(project.id, formData);

    if (result.error) {
      setShareError(result.error);
      setSharing(false);
      return;
    }

    setShareSuccess("Member added to project.");
    setShareEmail("");
    setSharing(false);
    router.refresh();
  };

  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId);
    await removeMember(project.id, memberId);
    setRemovingMemberId(null);
    router.refresh();
  };

  const badgeClass = (role: MemberRole) => {
    if (role === MemberRole.owner) return "badge badge--primary";
    if (role === MemberRole.admin) return "badge badge--success";
    return "badge badge--default";
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Project Settings</h1>
          <p className="page__subtitle">
            Update project details and share access with existing users.
          </p>
        </div>
        <div className="page__actions">
          <Button
            variant="secondary"
            onClick={() => router.push(`/projects/${project.id}`)}
          >
            Back to Project
          </Button>
        </div>
      </div>

      <div className="section">
        <div className="card" style={{ maxWidth: "640px" }}>
          <div className="card__header">
            <div>
              <h2 className="card__title">Project Details</h2>
              <p className="card__subtitle">
                Edit the project name and description.
              </p>
            </div>
          </div>
          <div className="card__body">
            {saveError && (
              <div
                style={{ color: "var(--color-error)", marginBottom: "16px" }}
              >
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div
                style={{ color: "var(--color-success)", marginBottom: "16px" }}
              >
                {saveSuccess}
              </div>
            )}
            <form onSubmit={handleSave} className="form">
              <InputGroup label="Project Name" htmlFor="name" required>
                <Input
                  id="name"
                  name="name"
                  required
                  defaultValue={project.name}
                />
              </InputGroup>
              <InputGroup label="Description" htmlFor="description">
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  defaultValue={project.description ?? ""}
                />
              </InputGroup>
              <InputGroup label="Result Tags" htmlFor="resultTags">
                <input
                  id="resultTags"
                  name="resultTags"
                  type="hidden"
                  value={resultTags.join(", ")}
                />
                <ArrayValueEditor
                  values={resultTags}
                  onChangeValue={(index, value) =>
                    setResultTags((prev) =>
                      prev.map((tag, currentIndex) =>
                        currentIndex === index ? value : tag,
                      ),
                    )
                  }
                  onAddValue={() => setResultTags((prev) => [...prev, ""])}
                  onRemoveValue={(index) =>
                    setResultTags((prev) =>
                      prev.filter((_, currentIndex) => currentIndex !== index),
                    )
                  }
                  addLabel="Add tag"
                  emptyMessage="No tags yet."
                />
                <p style={{ marginTop: "6px", color: "var(--color-gray-600)" }}>
                  Add tags to apply to results.
                </p>
              </InputGroup>
              <div className="form__actions">
                <Button type="submit" isLoading={saving}>
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Share Users</h2>
              <p className="card__subtitle">Add teammates to this project.</p>
            </div>
          </div>
          <div className="card__body">
            {shareError && (
              <div
                style={{ color: "var(--color-error)", marginBottom: "16px" }}
              >
                {shareError}
              </div>
            )}
            {shareSuccess && (
              <div
                style={{ color: "var(--color-success)", marginBottom: "16px" }}
              >
                {shareSuccess}
              </div>
            )}
            <form onSubmit={handleShare} className="form">
              <InputGroup label="User Email" htmlFor="email" required>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="teammate@example.com"
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.target.value)}
                  required
                />
              </InputGroup>
              <InputGroup label="Role" required>
                <input type="hidden" name="role" value={shareRole} />
                <Select
                  value={shareRole}
                  onValueChange={(value) =>
                    setShareRole(value as "admin" | "member")
                  }
                >
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </Select>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-gray-500)",
                    marginTop: "6px",
                  }}
                >
                  <strong>Member:</strong> Can view and upload documents, run
                  prompts, and view results.
                  <br />
                  <strong>Admin:</strong> Can do everything a member can, plus
                  manage project settings and invite others.
                </p>
              </InputGroup>
              <div className="form__actions">
                <Button type="submit" isLoading={sharing}>
                  Add Member
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Project Members</h3>
          <span style={{ fontSize: "14px", color: "var(--color-gray-500)" }}>
            {members.length} member{members.length !== 1 ? "s" : ""}
            {pendingInvites.length > 0 && (
              <>
                , {pendingInvites.length} pending invite
                {pendingInvites.length !== 1 ? "s" : ""}
              </>
            )}
          </span>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead className="table__header">
              <tr className="table__header-row">
                <th className="table__header-cell">User</th>
                <th className="table__header-cell">Email</th>
                <th className="table__header-cell">Role</th>
                <th className="table__header-cell">Actions</th>
              </tr>
            </thead>
            <tbody className="table__body">
              {members.map((member) => {
                const isCurrentUser = member.user.id === currentUserId;
                const canRemove =
                  member.role !== MemberRole.owner &&
                  !isCurrentUser &&
                  (currentMemberRole === MemberRole.owner ||
                    member.role !== MemberRole.admin);
                return (
                  <tr key={member.id} className="table__row">
                    <td className="table__cell">
                      {member.user.name || "Unknown"}
                      {isCurrentUser && (
                        <span
                          style={{
                            marginLeft: "8px",
                            color: "var(--color-gray-500)",
                          }}
                        >
                          (You)
                        </span>
                      )}
                    </td>
                    <td className="table__cell">{member.user.email || "—"}</td>
                    <td className="table__cell">
                      <span className={badgeClass(member.role)}>
                        {roleLabels[member.role]}
                      </span>
                    </td>
                    <td className="table__cell">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={!canRemove}
                        isLoading={removingMemberId === member.userId}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {pendingInvites.map((invite) => (
                <tr
                  key={invite.id}
                  className="table__row"
                  style={{ opacity: 0.7 }}
                >
                  <td className="table__cell">
                    <span
                      style={{
                        fontStyle: "italic",
                        color: "var(--color-gray-500)",
                      }}
                    >
                      Pending invite
                    </span>
                  </td>
                  <td className="table__cell">{invite.email}</td>
                  <td className="table__cell">
                    <span className="badge badge--default">
                      {roleLabels[invite.role]}
                    </span>
                  </td>
                  <td className="table__cell">
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--color-gray-500)",
                      }}
                    >
                      Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
