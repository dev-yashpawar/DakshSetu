export function notifySuccess(message = "Changes saved.") {
  if(typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function")
    window.dispatchEvent(new window.CustomEvent("dakshsetu:success",{detail:{message}}));
}
