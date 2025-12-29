"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function NewWorkspacePage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const apiUrl = process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] || "http://localhost:3001";

      const res = await fetch(`${apiUrl}/api/v1/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name || "My Workspace" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create workspace");
      }

      const data = await res.json();
      router.push(`/dashboard/workspace/${data.workspace.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: "2rem", maxWidth: "600px" }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "2rem" }}>Create New Workspace</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1.5rem" }}>
          <label
            htmlFor="name"
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: 500,
            }}
          >
            Workspace Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Workspace"
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              background: "var(--secondary)",
              color: "var(--foreground)",
              fontSize: "1rem",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "var(--error)20",
              color: "var(--error)",
              marginBottom: "1.5rem",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ background: "var(--secondary)" }}
          >
            Cancel
          </button>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Workspace"}
          </button>
        </div>
      </form>
    </div>
  );
}
