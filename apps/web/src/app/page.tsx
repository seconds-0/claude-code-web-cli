import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="container" style={{ textAlign: "center", paddingTop: "4rem" }}>
      <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>Claude Code Cloud</h1>
      <p style={{ fontSize: "1.25rem", color: "var(--muted)", marginBottom: "2rem" }}>
        Your cloud dev machine with Claude Code, accessible anywhere.
        <br />
        Real terminal. Real filesystem. Real persistence. Voice-first.
      </p>

      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <Link href="/sign-up">
          <button>Get Started</button>
        </Link>
        <Link href="/sign-in">
          <button style={{ background: "var(--secondary)" }}>Sign In</button>
        </Link>
      </div>

      <div
        style={{
          marginTop: "4rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "2rem",
          textAlign: "left",
        }}
      >
        <FeatureCard
          title="Real Terminal"
          description="Full shell access with tmux sessions. Run any command, install any package."
        />
        <FeatureCard
          title="Persistent Storage"
          description="Your files persist across sessions. Pick up where you left off."
        />
        <FeatureCard
          title="Claude Code Built-in"
          description="AI-powered development assistant ready to help you code."
        />
        <FeatureCard
          title="Voice-First"
          description="Speak your intent. Claude understands and executes."
        />
      </div>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: "var(--secondary)",
        padding: "1.5rem",
        borderRadius: "0.75rem",
        border: "1px solid var(--border)",
      }}
    >
      <h3 style={{ marginBottom: "0.5rem" }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{description}</p>
    </div>
  );
}
