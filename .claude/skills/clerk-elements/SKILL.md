# Clerk Elements Skill

Build completely custom authentication UIs using Clerk's headless UI primitives.

## When to Use

Use this skill when:

- User wants **custom-styled** auth pages (not default Clerk components)
- Need **explicit social buttons** (GitHub, Google) with custom layout
- Want **redirect mode** instead of popup for OAuth
- Building auth that matches an existing design system
- Implementing **OTP inputs** with custom styling
- Creating **multi-step auth flows** with custom UI

## Important Notice

**Clerk Elements is no longer in active development.** Clerk is building a replacement with a different approach. However, it still works and is the only way to build fully custom auth UIs with Clerk.

## Prerequisites

- **Next.js App Router** (required - no other framework support)
- **Clerk Core 2** or later
- **TypeScript config**: Set `moduleResolution: "bundler"` in tsconfig.json

```bash
pnpm add @clerk/elements
```

## Package Structure

```tsx
// Common components (shared between sign-in/sign-up)
import * as Clerk from "@clerk/elements/common";

// Sign-in specific components
import * as SignIn from "@clerk/elements/sign-in";

// Sign-up specific components
import * as SignUp from "@clerk/elements/sign-up";
```

---

## Component Reference

### Common Components (`@clerk/elements/common`)

#### `<Clerk.Connection>`

Renders OAuth/social authentication buttons.

| Prop      | Type    | Description                                                  |
| --------- | ------- | ------------------------------------------------------------ |
| `name`    | string  | **Required.** Provider ID: `google`, `github`, `apple`, etc. |
| `asChild` | boolean | Render as custom child element                               |

```tsx
<Clerk.Connection name="google">
  <Clerk.Icon /> Sign in with Google
</Clerk.Connection>

// With asChild for custom button
<Clerk.Connection name="github" asChild>
  <Button variant="outline">
    <GitHubIcon /> GitHub
  </Button>
</Clerk.Connection>
```

**Important:** Providers must be enabled in [Clerk Dashboard](https://dashboard.clerk.com/) → User & Authentication → Social connections.

---

#### `<Clerk.Field>`

Wraps form fields with automatic label association.

| Prop         | Type     | Description                              |
| ------------ | -------- | ---------------------------------------- | ------- | --------- | ------ | ------- |
| `name`       | string   | Field identifier (see table below)       |
| `alwaysShow` | boolean  | Force rendering regardless of flow state |
| `children`   | function | Access field state: `'success'           | 'error' | 'warning' | 'info' | 'idle'` |

**Field Names:**

| Context | Valid Names                                                                            |
| ------- | -------------------------------------------------------------------------------------- |
| Sign In | `identifier`, `password`, `code`, `confirmPassword`, `currentPassword`, `newPassword`  |
| Sign Up | `emailAddress`, `username`, `password`, `firstName`, `lastName`, `phoneNumber`, `code` |

```tsx
<Clerk.Field name="emailAddress">
  {(state) => (
    <>
      <Clerk.Label>Email</Clerk.Label>
      <Clerk.Input type="email" />
      <Clerk.FieldError />
      {state === "error" && <span className="text-red-500">!</span>}
    </>
  )}
</Clerk.Field>
```

---

#### `<Clerk.Input>`

Form input with automatic field binding.

| Prop               | Type    | Description                                         |
| ------------------ | ------- | --------------------------------------------------- |
| `type`             | string  | `'text'`, `'email'`, `'tel'`, `'password'`, `'otp'` |
| `validatePassword` | boolean | Enable real-time password validation                |
| `autoComplete`     | string  | Browser autocomplete hint                           |
| `asChild`          | boolean | Use custom input component                          |

**Data Attributes (for CSS):**

- `data-valid` / `data-invalid`
- `data-state="success|error|warning|info|idle"`
- `data-has-value`

```tsx
// Standard input
<Clerk.Input type="email" />

// With custom component
<Clerk.Input type="email" asChild>
  <CustomInput className="my-input" />
</Clerk.Input>

// Password with validation
<Clerk.Input type="password" validatePassword />
```

---

#### `<Clerk.Input type="otp">`

Specialized OTP input with segmented display.

| Prop                    | Type     | Description                      |
| ----------------------- | -------- | -------------------------------- |
| `length`                | number   | Number of digits (default: 6)    |
| `autoSubmit`            | boolean  | Auto-submit when complete        |
| `render`                | function | Custom segment rendering         |
| `passwordManagerOffset` | number   | Offset for password manager icon |

```tsx
<Clerk.Input
  type="otp"
  length={6}
  autoSubmit
  render={({ value, status }) => (
    <span data-status={status}>{value || <span className="placeholder">-</span>}</span>
  )}
/>
```

**Status values:** `'cursor'`, `'selected'`, `'hovered'`, `'none'`

---

#### `<Clerk.Label>`

Accessible label automatically associated with sibling input.

```tsx
<Clerk.Field name="email">
  <Clerk.Label>Email Address</Clerk.Label>
  <Clerk.Input type="email" />
</Clerk.Field>
```

---

#### `<Clerk.FieldError>`

Displays validation errors for the current field.

| Prop       | Type     | Description                               |
| ---------- | -------- | ----------------------------------------- |
| `name`     | string   | Target specific field (optional)          |
| `children` | function | Custom rendering with `{ message, code }` |

```tsx
// Simple
<Clerk.FieldError />

// Custom rendering
<Clerk.FieldError>
  {({ message, code }) => (
    <span className="error" data-code={code}>{message}</span>
  )}
</Clerk.FieldError>
```

---

#### `<Clerk.GlobalError>`

Displays API errors not tied to specific fields.

```tsx
<Clerk.GlobalError>{({ message }) => <div className="alert">{message}</div>}</Clerk.GlobalError>
```

---

#### `<Clerk.Loading>`

Access loading states for conditional UI.

| Prop       | Type     | Description                     |
| ---------- | -------- | ------------------------------- |
| `scope`    | string   | What to monitor (see below)     |
| `children` | function | Receives `(isLoading: boolean)` |

**Scope values:**

- `undefined` or omitted - Global loading state
- `'provider:google'` - Specific OAuth provider
- `'step:start'` - Specific step
- `'submit'` - Form submission

```tsx
<Clerk.Loading>
  {(isGlobalLoading) => (
    <Button disabled={isGlobalLoading}>
      {isGlobalLoading ? <Spinner /> : 'Continue'}
    </Button>
  )}
</Clerk.Loading>

// Provider-specific
<Clerk.Loading scope="provider:google">
  {(isLoading) => isLoading ? <Spinner /> : <GoogleIcon />}
</Clerk.Loading>
```

---

#### `<Clerk.Icon>`

Renders OAuth provider logos. Must be inside `<Clerk.Connection>`.

```tsx
<Clerk.Connection name="github">
  <Clerk.Icon className="w-4 h-4" />
  GitHub
</Clerk.Connection>
```

---

#### `<Clerk.Link>`

Navigation between sign-in and sign-up flows.

| Prop       | Type   | Description                |
| ---------- | ------ | -------------------------- |
| `navigate` | string | `'sign-in'` or `'sign-up'` |

```tsx
<Clerk.Link navigate="sign-up">Don't have an account? Sign up</Clerk.Link>
```

---

### Sign-In Components (`@clerk/elements/sign-in`)

#### `<SignIn.Root>`

Root wrapper managing sign-in state.

| Prop       | Type      | Default    | Description                          |
| ---------- | --------- | ---------- | ------------------------------------ |
| `path`     | string    | `/sign-in` | Mount path                           |
| `routing`  | string    | `'path'`   | `'path'` or `'virtual'` (for modals) |
| `fallback` | ReactNode | `null`     | Loading state content                |

```tsx
<SignIn.Root>
  {/* Steps go here */}
</SignIn.Root>

// Modal mode (no URL changes)
<SignIn.Root routing="virtual">
  {/* ... */}
</SignIn.Root>
```

---

#### `<SignIn.Step>`

Conditionally renders based on auth progress.

| Step Name         | Description                                   |
| ----------------- | --------------------------------------------- |
| `start`           | Initial form with identifier + social buttons |
| `verifications`   | OTP/password verification                     |
| `choose-strategy` | Alternative auth method selection             |
| `forgot-password` | Password recovery initiation                  |
| `reset-password`  | New password entry                            |

```tsx
<SignIn.Root>
  <SignIn.Step name="start">{/* Initial form */}</SignIn.Step>

  <SignIn.Step name="verifications">{/* Verification UI */}</SignIn.Step>
</SignIn.Root>
```

---

#### `<SignIn.Strategy>`

Conditionally renders for specific verification methods.

| Strategy                    | Description              |
| --------------------------- | ------------------------ |
| `email_code`                | Email verification code  |
| `phone_code`                | SMS verification code    |
| `password`                  | Password authentication  |
| `passkey`                   | WebAuthn passkey         |
| `totp`                      | Authenticator app        |
| `backup_code`               | Recovery codes           |
| `reset_password_email_code` | Password reset via email |
| `email_link`                | Magic link               |
| `oauth`                     | OAuth providers          |
| `saml`                      | SAML SSO                 |

```tsx
<SignIn.Step name="verifications">
  <SignIn.Strategy name="email_code">
    <h2>Check your email</h2>
    <p>
      We sent a code to <SignIn.SafeIdentifier />
    </p>
    <Clerk.Field name="code">
      <Clerk.Label>Code</Clerk.Label>
      <Clerk.Input type="otp" />
      <Clerk.FieldError />
    </Clerk.Field>
    <SignIn.Action submit>Verify</SignIn.Action>
  </SignIn.Strategy>

  <SignIn.Strategy name="password">
    <Clerk.Field name="password">
      <Clerk.Label>Password</Clerk.Label>
      <Clerk.Input type="password" />
      <Clerk.FieldError />
    </Clerk.Field>
    <SignIn.Action submit>Sign In</SignIn.Action>
  </SignIn.Strategy>
</SignIn.Step>
```

---

#### `<SignIn.Action>`

Form actions (submit, navigate, resend).

| Prop       | Type     | Description                                                       |
| ---------- | -------- | ----------------------------------------------------------------- |
| `submit`   | boolean  | Submit the form                                                   |
| `navigate` | string   | `'choose-strategy'`, `'forgot-password'`, `'previous'`, `'start'` |
| `resend`   | boolean  | Resend verification code                                          |
| `fallback` | function | UI during resend cooldown: `({ resendableAfter }) => ReactNode`   |
| `asChild`  | boolean  | Use custom button                                                 |

```tsx
// Submit
<SignIn.Action submit>Continue</SignIn.Action>

// Navigate
<SignIn.Action navigate="forgot-password">
  Forgot password?
</SignIn.Action>

// Resend with cooldown
<SignIn.Action
  resend
  fallback={({ resendableAfter }) => (
    <span>Resend in {resendableAfter}s</span>
  )}
>
  Resend code
</SignIn.Action>
```

---

#### `<SignIn.SafeIdentifier>`

Displays masked user identifier (e.g., `j***@example.com`).

```tsx
<p>
  We sent a code to <SignIn.SafeIdentifier />
</p>
```

---

#### `<SignIn.SupportedStrategy>`

Button to switch verification strategy.

```tsx
<SignIn.Step name="choose-strategy">
  <SignIn.SupportedStrategy name="email_code">Email me a code</SignIn.SupportedStrategy>
  <SignIn.SupportedStrategy name="password">Use password</SignIn.SupportedStrategy>
</SignIn.Step>
```

---

#### `<SignIn.Passkey>`

Triggers passkey autofill.

```tsx
<SignIn.Step name="start">
  <SignIn.Passkey>Sign in with passkey</SignIn.Passkey>
</SignIn.Step>
```

---

### Sign-Up Components (`@clerk/elements/sign-up`)

#### `<SignUp.Root>`

Root wrapper for sign-up flows.

| Prop       | Type      | Default    | Description             |
| ---------- | --------- | ---------- | ----------------------- |
| `path`     | string    | `/sign-up` | Mount path              |
| `routing`  | string    | `'path'`   | `'path'` or `'virtual'` |
| `fallback` | ReactNode | `null`     | Loading state           |

---

#### `<SignUp.Step>`

Conditionally renders sign-up stages.

| Step Name       | Description                                    |
| --------------- | ---------------------------------------------- |
| `start`         | Initial form with fields + social buttons      |
| `continue`      | Additional required fields (e.g., after OAuth) |
| `verifications` | Email/phone verification                       |

---

#### `<SignUp.Strategy>`

Verification method rendering.

| Strategy     | Description        |
| ------------ | ------------------ |
| `email_code` | Email verification |
| `phone_code` | SMS verification   |
| `email_link` | Magic link         |

---

#### `<SignUp.Action>`

Form actions (same API as SignIn.Action).

---

#### `<SignUp.Captcha>`

Cloudflare Turnstile CAPTCHA widget.

```tsx
<SignUp.Step name="start">
  {/* Fields... */}
  <SignUp.Captcha />
  <SignUp.Action submit>Create Account</SignUp.Action>
</SignUp.Step>
```

---

## Flow Patterns

### Complete Sign-In Flow

```tsx
"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignIn from "@clerk/elements/sign-in";

export default function SignInPage() {
  return (
    <SignIn.Root>
      <Clerk.Loading>
        {(isGlobalLoading) => (
          <>
            {/* Step 1: Start */}
            <SignIn.Step name="start">
              <h1>Sign In</h1>

              <Clerk.GlobalError />

              {/* Social Buttons */}
              <div className="social-buttons">
                <Clerk.Connection name="google" asChild>
                  <button disabled={isGlobalLoading}>
                    <Clerk.Loading scope="provider:google">
                      {(isLoading) => (isLoading ? "..." : "Google")}
                    </Clerk.Loading>
                  </button>
                </Clerk.Connection>

                <Clerk.Connection name="github" asChild>
                  <button disabled={isGlobalLoading}>
                    <Clerk.Loading scope="provider:github">
                      {(isLoading) => (isLoading ? "..." : "GitHub")}
                    </Clerk.Loading>
                  </button>
                </Clerk.Connection>
              </div>

              <div className="divider">or</div>

              {/* Email Input */}
              <Clerk.Field name="identifier">
                <Clerk.Label>Email</Clerk.Label>
                <Clerk.Input type="email" />
                <Clerk.FieldError />
              </Clerk.Field>

              <SignIn.Action submit disabled={isGlobalLoading}>
                Continue
              </SignIn.Action>

              <Clerk.Link navigate="sign-up">Don't have an account? Sign up</Clerk.Link>
            </SignIn.Step>

            {/* Step 2: Verifications */}
            <SignIn.Step name="verifications">
              {/* Email Code */}
              <SignIn.Strategy name="email_code">
                <h1>Check your email</h1>
                <p>
                  We sent a code to <SignIn.SafeIdentifier />
                </p>

                <Clerk.Field name="code">
                  <Clerk.Label>Verification Code</Clerk.Label>
                  <Clerk.Input type="otp" autoSubmit />
                  <Clerk.FieldError />
                </Clerk.Field>

                <SignIn.Action submit>Verify</SignIn.Action>

                <SignIn.Action
                  resend
                  fallback={({ resendableAfter }) => <span>Resend in {resendableAfter}s</span>}
                >
                  Resend code
                </SignIn.Action>
              </SignIn.Strategy>

              {/* Password */}
              <SignIn.Strategy name="password">
                <h1>Enter password</h1>

                <Clerk.Field name="password">
                  <Clerk.Label>Password</Clerk.Label>
                  <Clerk.Input type="password" />
                  <Clerk.FieldError />
                </Clerk.Field>

                <SignIn.Action submit>Sign In</SignIn.Action>
                <SignIn.Action navigate="forgot-password">Forgot password?</SignIn.Action>
              </SignIn.Strategy>
            </SignIn.Step>

            {/* Step 3: Choose Strategy (alternative methods) */}
            <SignIn.Step name="choose-strategy">
              <h1>Use another method</h1>

              <SignIn.SupportedStrategy name="email_code">Email me a code</SignIn.SupportedStrategy>

              <SignIn.SupportedStrategy name="password">Use password</SignIn.SupportedStrategy>

              <SignIn.Action navigate="previous">Back</SignIn.Action>
            </SignIn.Step>
          </>
        )}
      </Clerk.Loading>
    </SignIn.Root>
  );
}
```

---

### Complete Sign-Up Flow

```tsx
"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignUp from "@clerk/elements/sign-up";

export default function SignUpPage() {
  return (
    <SignUp.Root>
      {/* Step 1: Start */}
      <SignUp.Step name="start">
        <h1>Create Account</h1>

        <Clerk.GlobalError />

        {/* Social */}
        <Clerk.Connection name="google">
          <Clerk.Icon /> Google
        </Clerk.Connection>

        <Clerk.Connection name="github">
          <Clerk.Icon /> GitHub
        </Clerk.Connection>

        <div className="divider">or</div>

        {/* Fields */}
        <Clerk.Field name="emailAddress">
          <Clerk.Label>Email</Clerk.Label>
          <Clerk.Input type="email" />
          <Clerk.FieldError />
        </Clerk.Field>

        <Clerk.Field name="password">
          <Clerk.Label>Password</Clerk.Label>
          <Clerk.Input type="password" validatePassword />
          <Clerk.FieldError />
        </Clerk.Field>

        <SignUp.Captcha />

        <SignUp.Action submit>Create Account</SignUp.Action>

        <Clerk.Link navigate="sign-in">Already have an account? Sign in</Clerk.Link>
      </SignUp.Step>

      {/* Step 2: Continue (extra fields) */}
      <SignUp.Step name="continue">
        <h1>Complete Profile</h1>

        <Clerk.Field name="username">
          <Clerk.Label>Username</Clerk.Label>
          <Clerk.Input />
          <Clerk.FieldError />
        </Clerk.Field>

        <SignUp.Action submit>Continue</SignUp.Action>
      </SignUp.Step>

      {/* Step 3: Verifications */}
      <SignUp.Step name="verifications">
        <SignUp.Strategy name="email_code">
          <h1>Verify Email</h1>

          <Clerk.Field name="code">
            <Clerk.Label>Code</Clerk.Label>
            <Clerk.Input type="otp" />
            <Clerk.FieldError />
          </Clerk.Field>

          <SignUp.Action submit>Verify</SignUp.Action>

          <SignUp.Action resend>Resend</SignUp.Action>
        </SignUp.Strategy>
      </SignUp.Step>
    </SignUp.Root>
  );
}
```

---

## Styling Patterns

### Tailwind CSS

```tsx
<Clerk.Field name="email" className="space-y-2">
  <Clerk.Label className="text-sm font-medium">Email</Clerk.Label>
  <Clerk.Input type="email" className="w-full px-3 py-2 border rounded-md focus:ring-2" />
  <Clerk.FieldError className="text-sm text-red-500" />
</Clerk.Field>
```

### CSS-in-JS (styled-jsx)

```tsx
<Clerk.Field name="email">
  <Clerk.Label>Email</Clerk.Label>
  <Clerk.Input type="email" />
  <style jsx>{`
    :global([data-invalid]) {
      border-color: var(--error);
    }
  `}</style>
</Clerk.Field>
```

### With Component Libraries (asChild)

```tsx
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

<Clerk.Input type="email" asChild>
  <Input placeholder="Enter email" />
</Clerk.Input>

<SignIn.Action submit asChild>
  <Button>Continue</Button>
</SignIn.Action>
```

---

## OAuth Redirect vs Popup

**Clerk Elements uses redirect mode by default**, solving the narrow popup issue. The OAuth flow:

1. User clicks social button
2. Full-page redirect to provider (Google, GitHub, etc.)
3. Provider authenticates user
4. Redirect back to your app

This works better on mobile than the popup mode used by pre-built components.

---

## Dashboard Configuration

### Enable Social Providers

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Navigate to **User & Authentication** → **Social connections**
3. Enable desired providers (Google, GitHub, etc.)
4. Configure OAuth credentials for each provider

### Required Settings

For email code verification:

- **User & Authentication** → **Email, phone, username** → Enable **Email address**
- Enable **Email verification code** as verification method

---

## File Structure

```
app/
├── sign-in/
│   └── [[...sign-in]]/
│       └── page.tsx      # Custom sign-in with Elements
├── sign-up/
│   └── [[...sign-up]]/
│       └── page.tsx      # Custom sign-up with Elements
```

The `[[...sign-in]]` catch-all route handles all sign-in steps at `/sign-in/*`.

---

## TypeScript Configuration

Ensure `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

---

## Documentation Links

- [Overview](https://clerk.com/docs/customization/elements/overview)
- [Sign-In Guide](https://clerk.com/docs/customization/elements/guides/sign-in)
- [Sign-Up Guide](https://clerk.com/docs/customization/elements/guides/sign-up)
- [Common Components](https://clerk.com/docs/customization/elements/reference/common)
- [SignIn Components](https://clerk.com/docs/customization/elements/reference/sign-in)
- [SignUp Components](https://clerk.com/docs/customization/elements/reference/sign-up)
- [shadcn/ui Examples](https://clerk.com/docs/guides/customizing-clerk/elements/examples/shadcn-ui)
- [Clerk Dashboard](https://dashboard.clerk.com/)

---

## Troubleshooting

| Issue                    | Solution                                               |
| ------------------------ | ------------------------------------------------------ |
| Components not rendering | Check `moduleResolution: "bundler"` in tsconfig        |
| OAuth provider missing   | Enable in Clerk Dashboard → Social connections         |
| Verification not working | Check authentication settings in Dashboard             |
| Type errors with imports | Use namespace imports: `import * as SignIn from '...'` |
| Steps not changing       | Ensure `SignIn.Root` wraps all steps                   |
