import axios from "axios";
import { configureOffline, isOnline } from "./offline";
export const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || "/api",
  timeout: 30000,
});
api.interceptors.request.use((config) => {
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
