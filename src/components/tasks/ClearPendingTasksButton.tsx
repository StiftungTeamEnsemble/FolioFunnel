"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearPendingTasks } from "@/app/actions/runs";
import { Button } from "@/components/ui";

export function ClearPendingTasksButton() {
  const router = useRouter();
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all pending tasks? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsClearing(true);
    try {
      const result = await clearPendingTasks();
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    } catch (error) {
      alert("Failed to clear tasks");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClear}
      disabled={isClearing}
      variant="secondary"
    >
      {isClearing ? "Clearing..." : "Clear All Pending"}
    </Button>
  );
}
