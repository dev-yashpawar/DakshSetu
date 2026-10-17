export const missingApiBaseMessage =
  "Check VITE_API_BASE_URL and redeploy the frontend.";
export const invalidApiBaseMessage = missingApiBaseMessage;
export const frontendApiBaseMessage =
  "The API URL must not point to the Vercel frontend.";

/** Existing callers use /auth, /workers, etc.; the backend mounts them under /api. */
export function resolveApiBaseURL(
  value: string | undefined,
  production = false,
) {
  const configured = value?.trim().replace(/\/+$/, "");
  if (!configured) {
    if (production) throw Error(missingApiBaseMessage);
    return "/api";
  }
  // Explicit opt-in retained for the existing combined frontend/API deployment.
  if (configured === "/api") return configured;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw Error(invalidApiBaseMessage);
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error(invalidApiBaseMessage);
  if (url.hostname.endsWith(".vercel.app") || url.hostname === "vercel.app")
    throw Error(frontendApiBaseMessage);
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/api") ? path : path + "/api";
  return url.toString().replace(/\/+$/, "");
}
