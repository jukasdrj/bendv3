/**
 * Secrets Management Utilities
 *
 * Centralized utilities for accessing secrets from Cloudflare Secrets Store
 * or direct environment variables. Provides consistent interface for both.
 */

/**
 * Represents a Cloudflare secret binding, which can either be a direct string
 * (for local development) or a binding to the Secrets Store (with a .get() method).
 */
type SecretBinding = string | { get: () => Promise<string | null | undefined> };

/**
 * Get a secret value from Cloudflare Secrets Store or direct env var
 *
 * Supports both:
 * - Secrets Store (binding with async .get() method)
 * - Direct environment variables (string value)
 *
 * @param secretBinding - Either a Secrets Store binding or string value
 * @returns Promise<string | null> - The secret value or null if not found
 *
 * @example
 * // With Secrets Store binding
 * const apiKey = await getSecret(env.GOOGLE_BOOKS_API_KEY);
 *
 * // With direct env var (string)
 * const apiKey = await getSecret(env.GOOGLE_BOOKS_API_KEY);
 */
export async function getSecret(
  secretBinding: SecretBinding | undefined | null,
): Promise<string | null> {
  if (!secretBinding) return null;

  // String literal (direct env var)
  if (typeof secretBinding === "string") return secretBinding;

  // Secrets Store binding (has async .get() method)
  if (typeof secretBinding?.get === "function") {
    const value = await secretBinding.get();
    return value ?? null;
  }

  return null;
}

/**
 * Validate that a required secret is available
 *
 * Throws error if secret is missing, making it easier to catch
 * configuration issues early.
 *
 * @param secretBinding - Either a Secrets Store binding or string value
 * @param secretName - Name of the secret (for error messages)
 * @returns Promise<string> - The secret value
 * @throws Error if secret is not configured
 *
 * @example
 * const apiKey = await requireSecret(
 *   env.GOOGLE_BOOKS_API_KEY,
 *   'GOOGLE_BOOKS_API_KEY'
 * );
 */
export async function requireSecret(
  secretBinding: SecretBinding | undefined | null,
  secretName: string,
): Promise<string> {
  const value = await getSecret(secretBinding);
  if (!value) {
    throw new Error(`Required secret not configured: ${secretName}`);
  }
  return value;
}
