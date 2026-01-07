import { Waitlist } from "@clerk/nextjs";

export default function WaitlistPage() {
  return (
    <div className="waitlist-container">
      <div className="waitlist-header">
        <span className="waitlist-label">WAIT.01 / JOIN_WAITLIST</span>
        <h1>Join the Waitlist</h1>
        <p>Get early access to your cloud workspace</p>
      </div>

      <Waitlist
        appearance={{
          elements: {
            rootBox: "waitlist-root",
            card: "waitlist-card",
            headerTitle: "waitlist-title",
            headerSubtitle: "waitlist-subtitle",
            formFieldInput: "waitlist-input",
            formButtonPrimary: "waitlist-button",
            footerAction: "waitlist-footer",
          },
        }}
      />

      <style>{`
        .waitlist-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 1rem;
          background: var(--background);
        }

        .waitlist-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .waitlist-label {
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
          display: block;
          margin-bottom: 0.5rem;
        }

        .waitlist-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0.5rem 0;
          color: var(--foreground);
        }

        .waitlist-header p {
          color: var(--muted);
          font-size: 0.875rem;
          margin: 0;
        }

        /* Override Clerk Waitlist component styles */
        .cl-rootBox {
          width: 100%;
          max-width: 400px;
        }

        .cl-card {
          background: var(--surface) !important;
          border: 1px solid var(--border) !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }

        .cl-headerTitle,
        .cl-headerSubtitle {
          display: none !important;
        }

        .cl-formFieldLabel {
          color: var(--foreground) !important;
          font-family: var(--font-mono) !important;
          font-size: 0.75rem !important;
          font-weight: 500 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
        }

        .cl-formFieldInput {
          background: var(--background) !important;
          border: 1px solid var(--border) !important;
          border-radius: 0 !important;
          color: var(--foreground) !important;
          font-family: var(--font-mono) !important;
          caret-color: var(--primary) !important;
        }

        .cl-formFieldInput::placeholder {
          color: var(--muted) !important;
          opacity: 0.7 !important;
        }

        .cl-formFieldInput::placeholder {
          color: var(--muted) !important;
          opacity: 0.7 !important;
        }

        .cl-formFieldInput:focus {
          border-color: var(--primary) !important;
          box-shadow: none !important;
        }

        .cl-formButtonPrimary {
          background: var(--primary) !important;
          border: 1px solid var(--primary) !important;
          border-radius: 0 !important;
          font-family: var(--font-mono) !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          box-shadow: var(--shadow) !important;
        }

        .cl-formButtonPrimary:hover {
          background: var(--primary-hover) !important;
        }

        .cl-footer {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
