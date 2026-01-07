# Clerk Production Setup

This guide covers setting up Clerk for production with custom GitHub OAuth branding.

## Current Problem

Production is using test keys (`pk_test_`, `sk_test_`) which causes:

- GitHub authorization page shows "Clerk development and staging instances"
- OAuth authorizations don't persist properly between sessions
- Users re-prompted to authorize on every sign-in

## Step 1: Create Production Clerk Application

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Click your app name in the top-left → "Create application" (or use existing)
3. Name it `untethered-production` (or similar)
4. Select authentication methods: Email, GitHub, Google

## Step 2: Switch to Production Mode

1. In your Clerk app, go to **Configure → Settings**
2. Find **Instance type** section
3. Click **"Enable production"**
4. Clerk will provision production infrastructure

After enabling:

- Your keys will change from `pk_test_*` to `pk_live_*`
- The secret key changes from `sk_test_*` to `sk_live_*`

## Step 3: Create Custom GitHub OAuth App (for branding)

This makes GitHub show "Sign in to continue to **untethered.computer**" instead of "Clerk".

### 3a. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in:
   - **Application name:** `untethered.computer` (this is what users see!)
   - **Homepage URL:** `https://untethered.computer`
   - **Authorization callback URL:** `https://clerk.untethered.computer/v1/oauth_callback`
     - Or if not using custom domain: `https://<your-clerk-frontend-api>/v1/oauth_callback`
4. Click **Register application**
5. Copy the **Client ID**
6. Click **Generate a new client secret** and copy it immediately

### 3b. Configure in Clerk

1. Go to Clerk Dashboard → **Configure** → **SSO Connections**
2. Click **GitHub**
3. Toggle **"Use custom credentials"** ON
4. Paste your:
   - Client ID
   - Client Secret
5. Save

## Step 4: Update Railway Environment Variables

```bash
# Set production Clerk keys
railway variables -s web --set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
railway variables -s web --set CLERK_SECRET_KEY=sk_live_xxxxx

# Verify
railway variables -s web | grep CLERK
```

## Step 5: Configure Allowed Origins (Important!)

1. In Clerk Dashboard → **Configure** → **Paths**
2. Add your production domain to allowed origins:
   - `https://untethered.computer`
   - `https://www.untethered.computer` (if applicable)

## Step 6: Redeploy

```bash
# Trigger redeploy to pick up new env vars
railway redeploy -s web
```

## Verification Checklist

After setup, verify:

- [ ] Sign-in page loads without errors
- [ ] GitHub button shows your app name on authorization page
- [ ] After authorizing once, subsequent logins don't re-prompt
- [ ] Sign-up flow completes successfully
- [ ] Redirects work correctly after auth

## Troubleshooting

### "Invalid API key" errors

- Ensure both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are from the same Clerk app instance
- Make sure you're using production keys (`pk_live_`, `sk_live_`)

### GitHub still shows "Clerk" branding

- Verify custom credentials are enabled in Clerk SSO settings
- Check the callback URL matches exactly

### Authorization keeps re-prompting

- Usually means you're still on test keys
- Or there's a domain/cookie mismatch between environments

### Redirect issues after auth

- Check `afterSignInUrl` and `afterSignUpUrl` in ClerkProvider
- Verify allowed origins in Clerk dashboard

## Environment Variables Reference

| Variable                            | Description                  | Example             |
| ----------------------------------- | ---------------------------- | ------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public key (safe for client) | `pk_live_abc123...` |
| `CLERK_SECRET_KEY`                  | Secret key (server only)     | `sk_live_xyz789...` |

## Related Files

- `apps/web/src/app/layout.tsx` - ClerkProvider configuration
- `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx` - Sign-in page
- `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx` - Sign-up page
