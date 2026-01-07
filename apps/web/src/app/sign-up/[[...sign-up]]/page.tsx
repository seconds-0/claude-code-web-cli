import { redirect } from "next/navigation";
import SignUpForm from "./SignUpForm";

// Check if Clerk is in waitlist mode
async function isWaitlistMode(): Promise<boolean> {
  try {
    // Use the Clerk publishable key to determine the frontend API URL
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) return false;

    // Decode the publishable key to get the Clerk domain
    // Format: pk_test_<base64> or pk_live_<base64>
    // Note: Clerk uses base64url encoding which may contain underscores
    const parts = publishableKey.split("_");
    if (parts.length < 3) return false;

    // Join remaining parts in case base64url contains underscores
    const base64Part = parts.slice(2).join("_");
    if (!base64Part) return false;

    // Handle both base64 and base64url encoding
    const clerkDomain = Buffer.from(base64Part, "base64url").toString("utf-8").replace("$", "");

    // Validate the decoded domain looks reasonable
    if (!clerkDomain || !clerkDomain.includes(".")) return false;

    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(`https://${clerkDomain}/v1/environment`, {
        signal: controller.signal,
        next: { revalidate: 60 }, // Cache for 1 minute
      });

      clearTimeout(timeoutId);

      if (!response.ok) return false;

      const data = await response.json();
      return data?.user_settings?.sign_up?.mode === "waitlist";
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // If we can't determine (timeout, network error, etc.), default to showing sign-up
    return false;
  }
}

export default async function SignUpPage() {
  const waitlistEnabled = await isWaitlistMode();

  if (waitlistEnabled) {
    redirect("/waitlist");
  }

  return <SignUpForm />;
}
