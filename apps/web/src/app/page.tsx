import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 2rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--muted)",
            }}
          >
            SYS.001
          </span>
          <span
            style={{
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Claude Code Cloud
          </span>
        </div>
        <nav style={{ display: "flex", gap: "0.5rem" }}>
          <Link href="/sign-in">
            <button className="ghost">Sign In</button>
          </Link>
          <Link href="/sign-up">
            <button className="primary">Get Started</button>
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section
        style={{
          padding: "4rem 2rem",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        {/* Technical Label */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.625rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--muted)",
            marginBottom: "1rem",
          }}
        >
          PRODUCT.01 / CLOUD_DEV_ENVIRONMENT
        </div>

        {/* Hero Title */}
        <h1
          className="typing-cursor"
          style={{
            fontSize: "3rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: "1rem",
            maxWidth: "700px",
          }}
        >
          Your cloud dev machine with Claude Code
        </h1>

        <p
          style={{
            fontSize: "1.125rem",
            color: "var(--muted)",
            marginBottom: "2rem",
            maxWidth: "500px",
          }}
        >
          Real terminal. Real filesystem. Real persistence.
          <br />
          Accessible anywhere. Voice-first.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "3rem" }}>
          <Link href="/sign-up">
            <button className="primary">Start Coding →</button>
          </Link>
          <Link href="/sign-in">
            <button className="ghost">Sign In</button>
          </Link>
        </div>

        {/* Terminal Preview */}
        <div className="terminal-container" style={{ maxWidth: "800px" }}>
          <div className="terminal-header">
            <span>TERMINAL.01 / DEMO_SESSION</span>
            <span style={{ color: "var(--success)" }}>● CONNECTED</span>
          </div>
          <div className="terminal-screen" style={{ minHeight: "320px" }}>
            <TerminalDemo />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section
        style={{
          padding: "4rem 2rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--muted)",
              marginBottom: "2rem",
            }}
          >
            SPECIFICATIONS
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1px",
              background: "var(--border)",
            }}
          >
            <FeatureCard
              label="FEAT.01"
              title="Real Terminal"
              description="Full shell access with tmux sessions. Run any command, install any package."
            />
            <FeatureCard
              label="FEAT.02"
              title="Persistent Storage"
              description="Your files persist across sessions. Pick up where you left off."
            />
            <FeatureCard
              label="FEAT.03"
              title="Claude Code Built-in"
              description="AI-powered development assistant ready to help you code."
            />
            <FeatureCard
              label="FEAT.04"
              title="Voice-First"
              description="Speak your intent. Claude understands and executes."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: "1.5rem 2rem",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.625rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--muted)",
          }}
        >
          BUILD.2024.12 / v0.1.0
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.625rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--muted)",
          }}
        >
          © CLAUDE CODE CLOUD
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--primary)",
          marginBottom: "0.75rem",
        }}
      >
        {label}
      </div>
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: 700,
          marginBottom: "0.5rem",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--muted)",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
}

function TerminalDemo() {
  const lines = [
    { prompt: true, text: "claude --version" },
    { prompt: false, text: "Claude Code v1.0.0" },
    { prompt: true, text: "claude" },
    { prompt: false, text: "" },
    { prompt: false, text: "╭──────────────────────────────────────────────╮" },
    { prompt: false, text: "│  Claude Code                                 │" },
    { prompt: false, text: "│  Your AI-powered development assistant       │" },
    { prompt: false, text: "╰──────────────────────────────────────────────╯" },
    { prompt: false, text: "" },
    { prompt: false, text: "> Help me build a REST API with authentication" },
    { prompt: false, text: "" },
    { prompt: false, text: "I'll help you create a secure REST API. Let me:" },
    { prompt: false, text: "1. Set up the project structure" },
    { prompt: false, text: "2. Configure authentication middleware" },
    { prompt: false, text: "3. Create the API endpoints" },
    { prompt: false, text: "" },
  ];

  return (
    <div>
      {lines.map((line, i) => (
        <div key={i} style={{ minHeight: "1.4em" }}>
          {line.prompt && <span style={{ color: "var(--primary)" }}>❯ </span>}
          <span style={{ color: line.prompt ? "var(--foreground)" : "var(--success)" }}>
            {line.text}
          </span>
        </div>
      ))}
      <div>
        <span style={{ color: "var(--primary)" }}>❯ </span>
        <span className="terminal-cursor" />
      </div>
    </div>
  );
}
