export function validateProductionConfig(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== "production") return;
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    throw Error("Set JWT_SECRET to at least 32 characters in production.");
  if (!env.MONGODB_URI || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    throw Error("Set a valid MONGODB_URI in production.");
  const origin = (value: string | undefined, key: string) => {
    try {
      const url = new URL(value ?? "");
      const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        !(url.protocol === "https:" || (local && url.protocol === "http:"))
      )
        throw Error();
      return url.origin;
    } catch {
      throw Error(
        `Set ${key} to an HTTPS origin (HTTP loopback is allowed for local production checks).`,
      );
    }
  };
  const publicOrigin = origin(env.PUBLIC_APP_URL, "PUBLIC_APP_URL");
  const clients = (env.CLIENT_URL ?? "")
    .split(",")
    .map((value) => origin(value.trim(), "CLIENT_URL"));
  if (!clients.includes(publicOrigin))
    throw Error("CLIENT_URL must include PUBLIC_APP_URL.");
  const cloud = [
    env.CLOUDINARY_CLOUD_NAME,
    env.CLOUDINARY_API_KEY,
    env.CLOUDINARY_API_SECRET,
  ];
  if (cloud.some(Boolean) && !cloud.every(Boolean))
    throw Error(
      "Set all three CLOUDINARY credentials, or leave all three empty for manual fallback.",
    );
  if (
    env.PORT &&
    (!/^\d+$/.test(env.PORT) || +env.PORT < 1 || +env.PORT > 65535)
  )
    throw Error("PORT must be between 1 and 65535.");
  if (env.TRUST_PROXY && !["0", "1"].includes(env.TRUST_PROXY))
    throw Error("TRUST_PROXY must be 0 or 1.");
}
