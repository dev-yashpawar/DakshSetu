import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { resolveApiBaseURL } from "../src/services/api-base";
test("Backend origin and /api forms normalize once for every feature route", () => {
  for (const configured of [
    "https://dakshsetu-api.onrender.com",
    "https://dakshsetu-api.onrender.com/",
    "https://dakshsetu-api.onrender.com/api",
    " https://dakshsetu-api.onrender.com/api/ ",
  ]) {
    const baseURL = resolveApiBaseURL(configured, true),
      api = axios.create({ baseURL });
    assert.equal(baseURL, "https://dakshsetu-api.onrender.com/api");
    for (const path of [
      "/auth/register",
      "/auth/login",
      "/auth/me",
      "/workers/me",
      "/ai/extract-skills",
      "/assessor/dashboard",
      "/manage/users",
      "/ai/analyze-evidence",
      "/assessments/id/evidence",
      "/assessments/id/videos",
      "/passports/id",
      "/credentials/id/verify",
      "/reassessments",
      "/sync",
      "/health",
    ])
      assert.equal(
        api.getUri({ url: path }),
        "https://dakshsetu-api.onrender.com/api" + path,
      );
  }
});
test("Missing production config and Vercel backend targets fail without same-origin fallback", () => {
  assert.throws(() => resolveApiBaseURL(undefined, true), /VITE_API_BASE_URL/);
  assert.throws(() => resolveApiBaseURL("  ", true), /VITE_API_BASE_URL/);
  for (const value of [
    "https://daksh-setu.vercel.app",
    "https://daksh-setu-five.vercel.app/api",
  ])
    assert.throws(() => resolveApiBaseURL(value, true), /Vercel frontend/);
  for (const value of [
    "backend.example",
    "/backend",
    "javascript:alert(1)",
    "https://secret:password@backend.example",
    "https://backend.example?key=secret",
  ])
    assert.throws(() => resolveApiBaseURL(value, true));
  assert.equal(resolveApiBaseURL(undefined, false), "/api");
  assert.equal(resolveApiBaseURL("/api", true), "/api");
});
