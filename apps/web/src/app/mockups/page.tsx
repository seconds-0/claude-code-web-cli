export default function MockupsPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "2rem", fontSize: "1.5rem" }}>
        Brand Mockups - Pick Your Favorite
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "2rem",
        }}
      >
        {/* Option 1: Untethered (Modern Brand) */}
        <MockupCard
          title="Option 1: Modern Brand"
          description="Clean, brandable single word. Inter Bold, tight tracking."
        >
          <HeaderOption1 />
        </MockupCard>

        {/* Option 2: untethered.computer (Technical) */}
        <MockupCard
          title="Option 2: Technical Domain"
          description="Full domain, hacker aesthetic. JetBrains Mono, lowercase."
        >
          <HeaderOption2 />
        </MockupCard>

        {/* Option 3: UNTETHERED (Industrial) */}
        <MockupCard
          title="Option 3: Industrial Stamp"
          description="All caps, wide tracking. Teenage Engineering inspired."
        >
          <HeaderOption3 />
        </MockupCard>
      </div>

      {/* Full Page Previews */}
      <h2 style={{ marginTop: "4rem", marginBottom: "2rem", fontSize: "1.25rem" }}>
        Full Header Previews
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <FullHeader variant={1} />
        <FullHeader variant={2} />
        <FullHeader variant={3} />
      </div>
    </main>
  );
}

function MockupCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          padding: "1rem",
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "2rem", background: "var(--background)" }}>{children}</div>
      <div
        style={{
          padding: "1rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.875rem",
          color: "var(--muted)",
        }}
      >
        {description}
      </div>
    </div>
  );
}

/* Option 1: Untethered (Modern Brand) */
function HeaderOption1() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span
        style={{
          fontWeight: 700,
          fontSize: "1.25rem",
          letterSpacing: "-0.04em",
        }}
      >
        Untethered
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.5rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--muted)",
          verticalAlign: "super",
        }}
      >
        [SYS.001]
      </span>
    </div>
  );
}

/* Option 2: untethered.computer (Technical) */
function HeaderOption2() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          textTransform: "lowercase",
          letterSpacing: "0.02em",
          color: "var(--muted)",
        }}
      >
        sys.001 @
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          fontSize: "1.125rem",
          letterSpacing: "0.02em",
        }}
      >
        untethered<span style={{ color: "var(--primary)" }}>.</span>computer
        <span
          style={{
            display: "inline-block",
            width: "0.6em",
            height: "1.1em",
            background: "var(--primary)",
            marginLeft: "2px",
            animation: "blink 1s step-end infinite",
          }}
        />
      </span>
    </div>
  );
}

/* Option 3: UNTETHERED (Industrial) */
function HeaderOption3() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <span
        style={{
          fontWeight: 700,
          fontSize: "1.25rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        UNTETHERED
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--muted)",
          border: "1px solid var(--border)",
          padding: "0.25rem 0.5rem",
        }}
      >
        // SYS.001
      </span>
    </div>
  );
}

/* Full Header with navigation */
function FullHeader({ variant }: { variant: 1 | 2 | 3 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 2rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--background)",
      }}
    >
      <div>
        {variant === 1 && <HeaderOption1 />}
        {variant === 2 && <HeaderOption2 />}
        {variant === 3 && <HeaderOption3 />}
      </div>
      <nav style={{ display: "flex", gap: "0.5rem" }}>
        <button className="ghost">Sign In</button>
        <button className="primary">Get Started</button>
      </nav>
    </div>
  );
}
