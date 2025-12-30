"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface WorkspaceStatusPollerProps {
  workspaceStatus: string;
  instanceStatus?: string;
}

// Status values that indicate we should poll
const POLLING_STATUSES = ["pending", "provisioning", "starting", "stopping"];

export default function WorkspaceStatusPoller({
  workspaceStatus,
  instanceStatus,
}: WorkspaceStatusPollerProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const shouldPoll =
      POLLING_STATUSES.includes(workspaceStatus) ||
      (instanceStatus && POLLING_STATUSES.includes(instanceStatus));

    if (shouldPoll) {
      // Poll every 3 seconds
      intervalRef.current = setInterval(() => {
        console.log("[WorkspaceStatusPoller] Polling for status update...");
        router.refresh();
      }, 3000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [workspaceStatus, instanceStatus, router]);

  // This component doesn't render anything visible
  return null;
}
