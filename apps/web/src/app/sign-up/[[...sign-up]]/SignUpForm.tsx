"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignUp from "@clerk/elements/sign-up";

export default function SignUpForm() {
  return (
    <div className="auth-container">
      <SignUp.Root>
        <Clerk.Loading>
          {(isGlobalLoading) => (
            <>
              {/* Step 1: Start - Social + Email */}
              <SignUp.Step name="start" className="auth-card">
                <div className="auth-header">
                  <span className="auth-label">REG.01 / CREATE_ACCOUNT</span>
                  <h1>Create Account</h1>
                  <p>Create your workspace account</p>
                </div>

                <Clerk.GlobalError className="auth-global-error" />

                {/* Social Buttons */}
                <div className="social-buttons">
                  <Clerk.Connection name="github" className="social-btn">
                    <Clerk.Loading scope="provider:github">
                      {(isLoading) =>
                        isLoading ? (
                          <span className="loading-spinner" />
                        ) : (
                          <>
                            <GitHubIcon />
                            <span>GitHub</span>
                          </>
                        )
                      }
                    </Clerk.Loading>
                  </Clerk.Connection>

                  <Clerk.Connection name="google" className="social-btn">
                    <Clerk.Loading scope="provider:google">
                      {(isLoading) =>
                        isLoading ? (
                          <span className="loading-spinner" />
                        ) : (
                          <>
                            <GoogleIcon />
                            <span>Google</span>
                          </>
                        )
                      }
                    </Clerk.Loading>
                  </Clerk.Connection>
                </div>

                <div className="divider">
                  <span>or continue with email</span>
                </div>

                {/* Email Input */}
                <Clerk.Field name="emailAddress" className="auth-field">
                  <Clerk.Label className="auth-label">Email Address</Clerk.Label>
                  <Clerk.Input type="email" className="auth-input" placeholder="you@example.com" />
                  <Clerk.FieldError className="auth-error" />
                </Clerk.Field>

                <SignUp.Captcha className="captcha-container" />

                <SignUp.Action submit className="auth-submit" disabled={isGlobalLoading}>
                  <Clerk.Loading>
                    {(isLoading) =>
                      isLoading ? <span className="loading-spinner" /> : "Create Account"
                    }
                  </Clerk.Loading>
                </SignUp.Action>

                <div className="auth-footer">
                  <span>Already have access?</span>
                  <Clerk.Link navigate="sign-in" className="auth-link">
                    Sign in
                  </Clerk.Link>
                </div>
              </SignUp.Step>

              {/* Step 2: Continue - Extra fields if needed (e.g., after OAuth) */}
              <SignUp.Step name="continue" className="auth-card">
                <div className="auth-header">
                  <span className="auth-label">REG.02 / COMPLETE_PROFILE</span>
                  <h1>Almost There</h1>
                  <p>Complete your account setup</p>
                </div>

                <Clerk.GlobalError className="auth-global-error" />

                <Clerk.Field name="emailAddress" className="auth-field">
                  <Clerk.Label className="auth-label">Email Address</Clerk.Label>
                  <Clerk.Input type="email" className="auth-input" placeholder="you@example.com" />
                  <Clerk.FieldError className="auth-error" />
                </Clerk.Field>

                <SignUp.Action submit className="auth-submit" disabled={isGlobalLoading}>
                  <Clerk.Loading>
                    {(isLoading) => (isLoading ? <span className="loading-spinner" /> : "Continue")}
                  </Clerk.Loading>
                </SignUp.Action>
              </SignUp.Step>

              {/* Step 3: Verification - OTP Code */}
              <SignUp.Step name="verifications" className="auth-card">
                <SignUp.Strategy name="email_code">
                  <div className="auth-header">
                    <span className="auth-label">REG.03 / VERIFY</span>
                    <h1>Verify Email</h1>
                    <p>Enter the code sent to your email</p>
                  </div>

                  <Clerk.GlobalError className="auth-global-error" />

                  <Clerk.Field name="code" className="auth-field">
                    <Clerk.Label className="auth-label">Verification Code</Clerk.Label>
                    <Clerk.Input
                      type="otp"
                      autoSubmit
                      className="otp-input"
                      render={({ value, status }) => (
                        <span
                          className={`otp-segment ${status === "cursor" ? "otp-cursor" : ""} ${status === "selected" ? "otp-selected" : ""}`}
                          data-status={status}
                        >
                          {value || <span className="otp-placeholder">_</span>}
                        </span>
                      )}
                    />
                    <Clerk.FieldError className="auth-error" />
                  </Clerk.Field>

                  <SignUp.Action submit className="auth-submit" disabled={isGlobalLoading}>
                    <Clerk.Loading>
                      {(isLoading) => (isLoading ? <span className="loading-spinner" /> : "Verify")}
                    </Clerk.Loading>
                  </SignUp.Action>

                  <div className="auth-actions">
                    <SignUp.Action
                      resend
                      className="auth-link-btn"
                      fallback={({ resendableAfter }) => (
                        <span className="auth-muted">Resend in {resendableAfter}s</span>
                      )}
                    >
                      Resend code
                    </SignUp.Action>

                    <SignUp.Action navigate="start" className="auth-link-btn">
                      ← Back
                    </SignUp.Action>
                  </div>
                </SignUp.Strategy>
              </SignUp.Step>
            </>
          )}
        </Clerk.Loading>
      </SignUp.Root>

      <style jsx global>{`
        .auth-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 1rem;
          background: var(--background);
        }

        .auth-card {
          width: 100%;
          max-width: 400px;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 2rem;
        }

        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .auth-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0.5rem 0;
          color: var(--foreground);
        }

        .auth-header p {
          color: var(--muted);
          font-size: 0.875rem;
        }

        .auth-label {
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
          display: block;
          margin-bottom: 0.5rem;
        }

        /* Social Buttons */
        .social-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .social-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.875rem 1rem;
          background: var(--surface);
          color: var(--foreground);
          border: 1px solid var(--border-strong);
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          box-shadow: var(--shadow);
          transition:
            transform var(--transition-fast),
            box-shadow var(--transition-fast),
            background var(--transition);
        }

        .social-btn:hover {
          background: var(--surface-hover);
        }

        .social-btn:active {
          transform: translate(2px, 2px);
          box-shadow: none;
        }

        .social-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .social-btn svg {
          width: 18px;
          height: 18px;
        }

        /* Divider */
        .divider {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 1.5rem 0;
        }

        .divider::before,
        .divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        .divider span {
          font-family: var(--font-mono);
          font-size: 0.625rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted);
          background: var(--surface);
          padding: 0 0.5rem;
        }

        /* Form Fields */
        .auth-field {
          margin-bottom: 1.25rem;
          position: relative;
        }

        .auth-input {
          width: 100%;
          padding: 0.875rem 1rem;
          background: var(--background);
          color: var(--foreground);
          border: 1px solid var(--border);
          font-family: var(--font-mono);
          font-size: 0.875rem;
          transition: border-color var(--transition);
          caret-color: var(--primary);
        }

        .auth-input:focus {
          outline: none;
          border-color: var(--primary);
        }

        .auth-input::placeholder {
          color: var(--muted);
          opacity: 0.6;
        }

        .auth-input[data-invalid] {
          border-color: var(--error);
        }

        .auth-error {
          display: block;
          margin-top: 0.5rem;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--error);
        }

        .auth-global-error {
          display: block;
          padding: 0.75rem;
          margin-bottom: 1rem;
          background: rgba(255, 51, 51, 0.1);
          border: 1px solid var(--error);
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--error);
        }

        /* Captcha Container */
        .captcha-container {
          margin-bottom: 1.25rem;
        }

        /* Submit Button */
        .auth-submit {
          width: 100%;
          padding: 1rem;
          background: var(--primary);
          color: white;
          border: 1px solid var(--primary);
          font-family: var(--font-mono);
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          box-shadow: var(--shadow);
          transition:
            transform var(--transition-fast),
            box-shadow var(--transition-fast),
            background var(--transition);
        }

        .auth-submit:hover {
          background: var(--primary-hover);
        }

        .auth-submit:active {
          transform: translate(2px, 2px);
          box-shadow: none;
        }

        .auth-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        /* OTP Input */
        .otp-input {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
        }

        .otp-segment {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 56px;
          background: var(--background);
          border: 1px solid var(--border);
          font-family: var(--font-mono);
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--foreground);
          transition: border-color var(--transition);
        }

        .otp-segment.otp-cursor {
          border-color: var(--primary);
        }

        .otp-segment.otp-selected {
          border-color: var(--selection);
          background: rgba(0, 85, 255, 0.1);
        }

        .otp-placeholder {
          color: var(--muted);
          opacity: 0.3;
        }

        @media (max-width: 400px) {
          .otp-segment {
            width: 40px;
            height: 48px;
            font-size: 1.25rem;
          }
        }

        /* Footer & Links */
        .auth-footer {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 1.5rem;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .auth-link {
          color: var(--primary);
          font-weight: 500;
          cursor: pointer;
          transition: color var(--transition);
        }

        .auth-link:hover {
          color: var(--primary-hover);
        }

        .auth-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 1.5rem;
        }

        .auth-link-btn {
          background: none;
          border: none;
          padding: 0.5rem;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--muted);
          cursor: pointer;
          transition: color var(--transition);
        }

        .auth-link-btn:hover {
          color: var(--foreground);
        }

        .auth-muted {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--muted);
        }

        /* Loading Spinner */
        .loading-spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid currentColor;
          border-right-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// SVG Icons
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
