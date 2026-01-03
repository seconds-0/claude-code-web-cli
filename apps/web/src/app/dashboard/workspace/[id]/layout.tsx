"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Add class to body for immersive mobile mode
    const isWorkspace = pathname?.includes("/workspace/");
    if (isWorkspace) {
      document.body.classList.add("workspace-page");
    }
    return () => {
      document.body.classList.remove("workspace-page");
    };
  }, [pathname]);

  return <>{children}</>;
}
