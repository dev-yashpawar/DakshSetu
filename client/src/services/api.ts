import axios from "axios";
import { configureOffline, isOnline } from "./offline";
import { resolveApiBaseURL, frontendApiBaseMessage } from "./api-base";
const production = import.meta.env?.PROD === true;
let baseURL: string | undefined, configurationError: unknown;
try {
  baseURL = resolveApiBaseURL(import.meta.env?.VITE_API_BASE_URL, production);
} catch (error) {
  configurationError = error;
}
export const api = axios.create({
  baseURL,
  timeout: 30000,
});
api.interceptors.request.use((config) => {
  if (configurationError) throw configurationError;
  if (
    production &&
    config.baseURL === "/api" &&
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".vercel.app")
  )
    throw Error(frontendApiBaseMessage);
  if (!isOnline() && config.method === "get")
    throw new axios.AxiosError("Offline", "ERR_NETWORK", config);
  if (!isOnline() && config.method !== "get")
    throw Error(
      "Reconnect to upload evidence, use AI, or finalise an assessment.",
    );
  const token = sessionStorage.getItem("dakshsetu-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
configureOffline(api);
export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error))
    return (
      error.response?.data?.error ||
      (error.code === "ECONNABORTED"
        ? "The request timed out. Please try again."
        : "Unable to connect. Check your connection and try again.")
    );
  return error instanceof Error ? error.message : "Please try again.";
}
