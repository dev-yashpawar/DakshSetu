import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
test("failed route loading keeps navigation and saved drafts, with recovery on another route", async () => {
  const dom = new JSDOM("<html><body></body></html>", {
      url: "http://127.0.0.1:5173/broken",
    }),
    window = dom.window;
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
  }))
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  const { render, screen, cleanup } = await import("@testing-library/react"),
    user = (await import("@testing-library/user-event")).default.setup({
      document: window.document,
    });
  const { MemoryRouter, Routes, Route, Link } = await import(
      "react-router-dom"
    ),
    { SessionProvider } = await import("../src/store/session"),
    { RouteBoundary } = await import("../src/components/RouteBoundary");
  const originalError = console.error;
  console.error = () => {};
  function Failed() {
    throw new Error("Synthetic lazy route failure");
  }
  try {
    window.localStorage.setItem("synthetic-draft", "retained");
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <SessionProvider>
          <nav>
            <Link to="/healthy">Test navigation</Link>
          </nav>
          <RouteBoundary>
            <Routes>
              <Route path="/broken" element={<Failed />} />
              <Route path="/healthy" element={<h1>Healthy route</h1>} />
            </Routes>
          </RouteBoundary>
        </SessionProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "This page could not load" });
    assert.ok(screen.getByRole("button", { name: "Reload page" }));
    assert.equal(window.localStorage.getItem("synthetic-draft"), "retained");
    await user.click(screen.getByRole("link", { name: "Test navigation" }));
    await screen.findByRole("heading", { name: "Healthy route" });
    assert.equal(screen.queryByRole("alert"), null);
  } finally {
    console.error = originalError;
    cleanup();
    dom.window.close();
  }
});
