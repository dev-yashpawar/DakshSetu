import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProductionConfig } from "../src/production-config.js";
const valid = {
  NODE_ENV: "production",
  JWT_SECRET: "synthetic-secret-with-at-least-32-characters",
  MONGODB_URI: "mongodb://127.0.0.1:27027/test",
  CLIENT_URL: "https://dakshsetu.example",
  PUBLIC_APP_URL: "https://dakshsetu.example",
};
test("Production startup rejects missing or unsafe origins and incomplete configuration without exposing values", () => {
  validateProductionConfig(valid);
  validateProductionConfig({
    ...valid,
    CLIENT_URL: "http://127.0.0.1:4001",
    PUBLIC_APP_URL: "http://127.0.0.1:4001",
  });
  validateProductionConfig({ NODE_ENV: "development" });
  for (const changes of [
    { JWT_SECRET: "short" },
    { MONGODB_URI: "" },
    { PUBLIC_APP_URL: "" },
    { CLIENT_URL: "" },
    { PUBLIC_APP_URL: "http://insecure.example" },
    { PUBLIC_APP_URL: "https://dakshsetu.example/path" },
    { PUBLIC_APP_URL: "https://private:secret@dakshsetu.example" },
    { CLIENT_URL: "https://different.example" },
    { CLOUDINARY_API_SECRET: "synthetic-secret" },
    { PORT: "0" },
    { PORT: "65536" },
    { TRUST_PROXY: "true" },
  ])
    assert.throws(
      () => validateProductionConfig({ ...valid, ...changes }),
      (error) =>
        error instanceof Error &&
        !error.message.includes("synthetic-secret") &&
        !error.message.includes("private:secret"),
    );
});
