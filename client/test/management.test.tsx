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
import { questions } from "../../server/src/questions";

test(
  "Connected portal controls: compact header → create/deactivate user → assign candidate → edit worker profile → restore offline experience",
  { timeout: 150000 },
  async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
        url: "http://127.0.0.1:5173/admin/users",
        pretendToBeVisual: true,
      }),
      w = dom.window;
    for (const [key, value] of Object.entries({
      window: w,
      document: w.document,
      navigator: w.navigator,
      localStorage: w.localStorage,
      sessionStorage: w.sessionStorage,
      HTMLElement: w.HTMLElement,
      HTMLInputElement: w.HTMLInputElement,
      HTMLTextAreaElement: w.HTMLTextAreaElement,
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
    let online = true;
    Object.defineProperty(w.navigator, "onLine", {
      get: () => online,
      configurable: true,
    });
    w.URL.createObjectURL = () => "blob:synthetic-ui";
    w.URL.revokeObjectURL = () => {};
    const dbName =
        "dakshsetu_test_portalui_" + randomUUID().replaceAll("-", ""),
      ctx = await connectDatabase("mongodb://127.0.0.1:27027/" + dbName);
    await seedDatabase(ctx.models);
    const app = createApp(ctx.models, {
        jwtSecret: randomUUID(),
        clientUrls: ["http://127.0.0.1:5173"],
        test: true,
        ai: { apiKey: "", model: "test" },
      }),
      server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const { render, screen, within, waitFor, cleanup } = await import(
        "@testing-library/react"
      ),
      user = (await import("@testing-library/user-event")).default.setup({
        document: w.document,
      }),
      { api } = await import("../src/services/api"),
      offline = await import("../src/services/offline");
    const device = new offline.OfflineDatabase("portal-ui-" + randomUUID());
    offline.useOfflineDatabaseForTest(device);
    api.defaults.baseURL =
      "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api";
    const App = (await import("../src/App")).default;
    const login = async (role: string) => {
      const d = (
        await api.post("/auth/login", {
          email: role + "@dakshsetu.demo",
          password: "demo123",
        })
      ).data;
      sessionStorage.setItem("dakshsetu-token", d.token);
      offline.rememberUser(d.user);
      return d;
    };
    const click = async (name: string) =>
      user.click(await screen.findByRole("button", { name, exact: true }));
    try {
      await login("admin");
      console.log("Portal checkpoint: admin login");
      render(<App />);
      await screen.findByRole("heading", { name: "User management" });
      await screen.findByText("Demo Administrator", { selector: "td" });
      const header = w.document.querySelector("header")!;
      assert.equal(header.querySelector("nav"), null);
      assert.equal(within(header).queryByRole("link", { name: "Home" }), null);
      assert.ok(within(header).getByRole("button", { name: "Sign out" }));
      assert.ok(
        within(header).getByRole("combobox", { name: "Your language" }),
      );
      await user.click(
        within(
          screen.getByRole("navigation", { name: "Admin navigation" }),
        ).getByRole("link", { name: "Dashboard", exact: true }),
      );
      await screen.findByRole("heading", { name: "Total workers" });
      assert.equal(
        w.document.querySelectorAll(".admin-content .stat-card").length,
        4,
      );
      assert.equal(w.document.querySelector(".admin-grid"), null);
      assert.ok(
        screen.getByRole("link", { name: "Assign assessments", exact: true }),
      );
      const more = screen.getByText("More tools", { selector: "summary" });
      console.log("Portal checkpoint: dashboard");
      // JSDOM does not implement the browser's summary Enter activation.
      await user.click(more);
      assert.ok(more.closest("details")?.open);
      const auditLink = screen.getByRole("link", {
        name: "Audit log",
        exact: true,
      });
      auditLink.focus();
      assert.equal(w.document.activeElement, auditLink);
      assert.equal(auditLink.getAttribute("href"), "/admin/audit-log");
      console.log("Portal checkpoint: navigation expanded");
      await user.click(
        within(
          screen.getByRole("navigation", { name: "Admin navigation" }),
        ).getByRole("link", { name: "User management", exact: true }),
      );
      await screen.findByRole("heading", { name: "User management" });
      await click("Create user");
      console.log("Portal checkpoint: create user");
      const editor = await screen.findByRole("region", { name: "Edit record" });
      const scope = within(editor);
      await user.type(scope.getByLabelText("Full name"), "UI managed worker");
      const email = "portal-ui-" + randomUUID() + "@test.invalid";
      await user.type(scope.getByLabelText("Email address"), email);
      await user.type(scope.getByLabelText("Mobile number"), "9876543210");
      await user.type(
        scope.getByLabelText("Password (12+ characters)"),
        "managed-secret-123",
      );
      await click("Save changes");
      console.log("Portal checkpoint: user saved");
      await waitFor(
        () => {
          const alert = w.document.querySelector("[role=alert]");
          if (alert) throw Error("Portal error: " + alert.textContent);
          assert.ok(screen.queryByText(email), "Waiting for persisted account");
        },
        { timeout: 10000 },
      );
      const row = screen.getByText(email).closest("tr")!;
      await user.click(
        within(row).getByRole("button", { name: "Manage access" }),
      );
      await user.selectOptions(
        screen.getByLabelText("Account status"),
        "INACTIVE",
      );
      await user.type(
        screen.getByLabelText("Reason for change"),
        "Synthetic account temporarily disabled.",
      );
      await click("Save changes");
      await waitFor(() =>
        assert.equal(
          within(screen.getByText(email).closest("tr")!).getByText("INACTIVE")
            .textContent,
          "INACTIVE",
        ),
      );
      const managed = await ctx.models.User.findOne({ email }).lean();
      assert.equal(managed!.accountStatus, "INACTIVE");
      assert.equal(
        await ctx.models.Profile.countDocuments({ userId: managed!.id }),
        1,
      );
      const workerEmail = "candidate-ui-" + randomUUID() + "@test.invalid",
        worker = (
          await api.post("/auth/register", {
            name: "UI assigned candidate",
            email: workerEmail,
            phone: "9876543210",
            password: "candidate-pass-123",
            preferredLanguage: "en",
          })
        ).data;
      const adminToken = sessionStorage.getItem("dakshsetu-token")!;
      sessionStorage.setItem("dakshsetu-token", worker.token);
      await api.put("/workers/me", {
        trade: "Electrician",
        yearsExperience: 8,
      });
      await api.post("/workers/experience", {
        trade: "Electrician",
        yearsExperience: 8,
        experienceDescription:
          "I install domestic wiring and switches and repair electrical faults.",
      });
      await api.put("/workers/skills", {
        skills: ["Residential Wiring", "Switch Installation"],
      });
      await api.post("/qualifications/match");
      const a = (
        await api.post("/self-assessment/submit", {
          responses: questions.map((q) => ({
            questionId: q.id,
            answer: q.correctAnswer,
          })),
        })
      ).data;
      sessionStorage.setItem("dakshsetu-token", adminToken);
      await user.click(
        screen.getByRole("link", {
          name: "Assessment monitoring",
          exact: true,
        }),
      );
      await screen.findByText("UI assigned candidate");
      await user.click(
        within(
          screen.getByText("UI assigned candidate").closest("tr")!,
        ).getByRole("button", { name: "Assign", exact: true }),
      );
      await user.type(
        within(
          screen.getByRole("region", { name: "Edit record" }),
        ).getByLabelText("Batch"),
        "UI synthetic batch",
      );
      await user.type(
        screen.getByLabelText("Reason for change"),
        "Assign for the supervised synthetic practical assessment.",
      );
      await click("Save changes");
      await screen.findByText("UI synthetic batch");
      const saved = await ctx.models.Assessment.findOne({ id: a.id }).lean();
      assert.ok(saved!.assessorId);
      assert.equal(saved!.selfAssessmentScore, 100);
      cleanup();
      sessionStorage.setItem("dakshsetu-token", worker.token);
      offline.rememberUser(worker.user);
      w.history.replaceState({}, "", "/worker/profile");
      render(<App />);
      await screen.findByRole("heading", { name: "My profile" });
      await user.type(screen.getByLabelText("District"), "Pune");
      await click("Save changes");
      await screen.findByText("Changes saved.");
      assert.equal(
        (await ctx.models.Profile.findOne({ userId: worker.user.id }).lean())!
          .district,
        "Pune",
      );
      await user.click(
        screen.getByRole("link", { name: "Dashboard", exact: true }),
      );
      await screen.findByRole("heading", { name: "My dashboard" });
      await screen.findByText("Demo Assessor");
      await screen.findByText("UI synthetic batch");
      cleanup();
      await login("worker");
      await api.put("/workers/me", {
        trade: "Electrician",
        yearsExperience: 8,
      });
      w.history.replaceState({}, "", "/worker/describe");
      render(<App />);
      await screen.findByRole("textbox");
      const declaration =
        "I have installed house wiring and switches for eight years.";
      await user.type(screen.getByRole("textbox"), declaration);
      await waitFor(async () => {
        assert.ok(
          await device.assessmentDrafts
            .filter((d) => d.kind === "declaration")
            .count(),
        );
      });
      online = false;
      w.dispatchEvent(new w.Event("offline"));
      await click("Save experience on device");
      await waitFor(async () =>
        assert.equal(
          (await offline.pendingItems(offline.activeOwner()!)).filter(
            (x) => x.type === "declaration",
          ).length,
          1,
        ),
      );
      cleanup();
      render(<App />);
      await waitFor(() =>
        assert.equal(
          (screen.getByRole("textbox") as HTMLTextAreaElement).value,
          declaration,
        ),
      );
      online = true;
      w.dispatchEvent(new w.Event("online"));
      await waitFor(
        async () =>
          assert.equal(
            (await offline.pendingItems(offline.activeOwner()!)).length,
            0,
          ),
        { timeout: 15000 },
      );
      const demoWorker = await ctx.models.User.findOne({
        email: "worker@dakshsetu.demo",
      }).lean();
      assert.equal(
        (await ctx.models.Profile.findOne({ userId: demoWorker!.id }).lean())!
          .experienceDescription,
        declaration,
      );
      cleanup();
      await login("assessor");
      const observation = {
        evidenceId: randomUUID(),
        observations: [],
        warnings: [],
        suggestedScore: 7,
        maxScore: 10,
        summary: "Synthetic observation for UI review only.",
        limitations: ["No certification decision."],
        createdAt: new Date().toISOString(),
      };
      await ctx.models.Assessment.updateOne(
        { id: a.id },
        {
          $set: {
            aiObservation: observation,
            aiSuggestedScore: 70,
            status: "IN_ASSESSMENT",
          },
        },
      );
      w.history.replaceState(
        {},
        "",
        `/assessor/candidates/${worker.user.id}?tab=evidence`,
      );
      render(<App />);
      await screen.findByRole("heading", {
        name: "Human review of AI observation",
      });
      await user.selectOptions(
        screen.getByLabelText("Review decision"),
        "edited",
      );
      await user.type(
        screen.getByLabelText("Review notes"),
        "Synthetic human correction recorded separately from AI.",
      );
      await click("Save AI review");
      await waitFor(async () =>
        assert.equal(
          (await ctx.models.Assessment.findOne({ id: a.id }).lean())?.aiReview
            ?.decision,
          "edited",
        ),
      );
      class RecognitionContract {
        lang = "";
        continuous = false;
        interimResults = false;
        onresult: any;
        onend: any;
        onerror: any;
        start() {
          assert.equal(this.lang, "en-IN");
          queueMicrotask(() => {
            this.onresult?.({
              resultIndex: 0,
              results: [
                Object.assign(
                  [{ transcript: "Synthetic voice observation." }],
                  { isFinal: true },
                ),
              ],
            });
            this.onend?.();
          });
        }
        stop() {
          this.onend?.();
        }
        abort() {}
      }
      Object.defineProperty(w, "SpeechRecognition", {
        value: RecognitionContract,
        configurable: true,
      });
      await click("Assessment");
      const first = w.document.querySelector("fieldset")!;
      await user.click(within(first).getAllByRole("radio")[3]);
      await user.click(
        within(first).getByRole("button", { name: "Speak remark" }),
      );
      await waitFor(() =>
        assert.equal(
          (within(first).getByRole("textbox") as HTMLInputElement).value,
          "Synthetic voice observation.",
        ),
      );
      Object.defineProperty(w, "SpeechRecognition", {
        value: undefined,
        configurable: true,
      });
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
