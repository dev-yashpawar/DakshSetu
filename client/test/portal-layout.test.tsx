import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import sharp from "sharp";
test("Compact portal branding contains the entire supplied artwork and has no legacy cropped-image class", async () => {
  const dom = new JSDOM("<html><body></body></html>", {
      url: "http://127.0.0.1:5173/admin",
    }),
    window = dom.window;
  for (const [key, value] of Object.entries({
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
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  const { render, screen, cleanup } = await import("@testing-library/react"),
    { MemoryRouter } = await import("react-router-dom"),
    { SessionProvider } = await import("../src/store/session"),
    { Brand } = await import("../src/components/common"),
    { api } = await import("../src/services/api");
  const adapter = api.defaults.adapter;
  api.defaults.adapter = async (config) => ({
    data: { languages: ["en", "hi", "mr"], demoEnabled: true },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  try {
    render(
      <MemoryRouter>
        <SessionProvider>
          <Brand compact to="/admin" />
        </SessionProvider>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "DakshSetu home" });
    assert.equal(link.getAttribute("href"), "/admin");
    assert.ok(!link.classList.contains("supplied-logo"));
    const svg = link.querySelector("svg")!,
      [x, y, width, height] = svg
        .getAttribute("viewBox")!
        .split(" ")
        .map(Number);
    const { data, info } = await sharp("client/public/dakshsetu-logo.png")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = info.width,
      minY = info.height,
      maxX = 0,
      maxY = 0;
    for (let yy = 0; yy < info.height; yy++)
      for (let xx = 0; xx < info.width; xx++)
        if (data[(yy * info.width + xx) * 4 + 3] >= 64) {
          minX = Math.min(minX, xx);
          minY = Math.min(minY, yy);
          maxX = Math.max(maxX, xx);
          maxY = Math.max(maxY, yy);
        }
    assert.ok(
      minX >= x && maxX <= x + width && minY >= y && maxY <= y + height,
      `Logo artwork ${minX},${minY}..${maxX},${maxY} falls outside its frame`,
    );
    assert.equal(
      svg.querySelector("image")!.getAttribute("href"),
      "/dakshsetu-logo.png",
    );
    assert.equal(
      svg.querySelector("image")!.getAttribute("width"),
      String(info.width),
    );
    assert.equal(
      svg.querySelector("image")!.getAttribute("height"),
      String(info.height),
    );
  } finally {
    cleanup();
    api.defaults.adapter = adapter;
    dom.window.close();
  }
});
