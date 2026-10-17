import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { connectDatabase } from "../../server/src/models";
import { seedDatabase } from "../../server/src/services";
import { createApp } from "../../server/src/app";

test(
  "Separate login pages connect to their role, reject wrong accounts and protect staff registration",
  { timeout: 120000 },
  async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://127.0.0.1:5173/login/worker",
      pretendToBeVisual: true,
    });
    const w = dom.window;
    for (const [key, value] of Object.entries({
      window: w,
      document: w.document,
      navigator: w.navigator,
      localStorage: w.localStorage,
      sessionStorage: w.sessionStorage,
      HTMLElement: w.HTMLElement,
      HTMLInputElement: w.HTMLInputElement,
      Element: w.Element,
      Node: w.Node,
      MutationObserver: w.MutationObserver,
      CustomEvent: w.CustomEvent,
      XMLHttpRequest: w.XMLHttpRequest,
      FormData: w.FormData,
      File: w.File,
      FileReader: w.FileReader,
      Blob: w.Blob,
      URL: w.URL,
      getComputedStyle: w.getComputedStyle.bind(w),
      requestAnimationFrame: w.requestAnimationFrame.bind(w),
    }))
      Object.defineProperty(globalThis, key, {
        value,
        writable: true,
        configurable: true,
      });
    w.scrollTo = () => {};
    const dbName = "dakshsetu_test_login_" + randomUUID().replaceAll("-", "");
    const ctx = await connectDatabase("mongodb://127.0.0.1:27027/" + dbName);
    await seedDatabase(ctx.models);
    const server = createApp(ctx.models, {
      jwtSecret: randomUUID(),
      clientUrls: ["http://127.0.0.1:5173"],
      test: true,
      ai: { apiKey: "", model: "test" },
    }).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const { render, screen, within, waitFor, cleanup, configure } =
      await import("@testing-library/react");
    configure({ asyncUtilTimeout: 10000 });
    const user = (await import("@testing-library/user-event")).default.setup({
      document: w.document,
    });
    const { api } = await import("../src/services/api");
    api.defaults.baseURL =
      "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api";
    const offline = await import("../src/services/offline");
    const device = new offline.OfflineDatabase("login-ui-" + randomUUID());
    offline.useOfflineDatabaseForTest(device);
    const App = (await import("../src/App")).default;
    try {
      render(<App />);
      for (const [role, label, heading] of [
        ["worker", "Worker", "Worker sign in"],
        ["assessor", "Assessor", "Assessor sign in"],
        ["admin", "Administrator", "Administrator sign in"],
      ]) {
        const portalNav = await screen.findByRole("navigation", {
          name: "Choose your portal",
        });
        await user.click(
          within(portalNav).getByRole("link", { name: label, exact: true }),
        );
        await screen.findByRole("heading", { name: heading, exact: true });
        assert.equal(w.location.pathname, "/login/" + role);
        assert.equal(
          !!screen.queryByRole("button", { name: "Continue with DigiLocker" }),
          role === "worker",
        );
        const card = w.document.querySelector(".auth-card")!;
        assert.equal(
          !!within(card as HTMLElement).queryByRole("link", {
            name: "Create your account",
          }),
          role === "worker",
        );
        const email = screen.getByLabelText("Email address"),
          password = screen.getByLabelText("Password", { exact: true });
        const demoButton = await screen.findByRole("button", {
          name: role === "worker" ? /Use demo/ : role === "assessor" ? "Use demo assessor account" : "Use demo administrator account",
        });
        await user.click(demoButton);
        assert.equal((email as HTMLInputElement).value, role + "@dakshsetu.demo");
        assert.equal((password as HTMLInputElement).value, "demo123");
        await user.clear(email);
        await user.clear(password);
        await user.type(
          email,
          (role === "admin" ? "worker" : "admin") + "@dakshsetu.demo",
        );
        await user.type(password, "demo123");
        await user.click(
          screen.getByRole("button", { name: "Sign in", exact: true }),
        );
        await screen.findByText("Use an account for the selected portal.");
        assert.equal(sessionStorage.getItem("dakshsetu-token"), null);
        await user.clear(email);
        await user.type(email, role + "@dakshsetu.demo");
        await user.click(
          screen.getByRole("button", { name: "Sign in", exact: true }),
        );
        await screen.findByRole("button", { name: "Sign out", exact: true });
        await waitFor(() =>
          assert.ok(
            w.location.pathname.startsWith(
              role === "worker" ? "/worker" : "/" + role,
            ),
          ),
        );
        assert.ok(sessionStorage.getItem("dakshsetu-token"));
        await user.click(
          screen.getByRole("button", { name: "Sign out", exact: true }),
        );
        await screen.findByRole("link", {
          name: "Register / Login",
          exact: true,
        });
        await user.click(
          screen.getByRole("link", { name: "Register / Login", exact: true }),
        );
      }
      await user.click(
        await screen.findByRole("link", {
          name: "Create your account",
          exact: true,
        }),
      );
      await screen.findByRole("heading", {
        name: "Create your account",
        exact: true,
      });
      await user.click(
        screen.getByRole("button", { name: "Continue with DigiLocker" }),
      );
      const demo = screen.getByRole("region", { name: "DigiLocker demo" });
      assert.ok(within(demo).getByText(/shared demo worker account/));
      await user.click(
        within(demo).getByRole("button", { name: "Continue with demo worker" }),
      );
      await screen.findByRole("button", { name: "Sign out" });
      await waitFor(() =>
        assert.equal(w.location.pathname, "/worker/dashboard"),
      );
    } finally {
      cleanup();
      offline.useOfflineDatabaseForTest(undefined);
      await device.delete();
      server.closeIdleConnections();
      await new Promise<void>((r) => server.close(() => r()));
      assert.equal(ctx.connection.name, dbName);
      await ctx.connection.dropDatabase();
      await ctx.connection.close();
      dom.window.close();
    }
  },
);
