// Test setup - runs before all tests
// Skip real JWT verification in tests
process.env["SKIP_AUTH"] = "true";

// Mock DATABASE_URL for tests that don't actually use the database
if (!process.env["DATABASE_URL"]) {
  process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_db";
}

// Set CLERK_ISSUER_URL for tests that disable SKIP_AUTH
if (!process.env["CLERK_ISSUER_URL"]) {
  process.env["CLERK_ISSUER_URL"] = "https://test.clerk.accounts.dev";
}
