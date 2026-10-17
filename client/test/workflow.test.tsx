import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import React from "react";
import { JSDOM } from "jsdom";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { connectDatabase } from "../../server/src/models.js";
import { seedDatabase } from "../../server/src/services.js";
import { createApp } from "../../server/src/app.js";
import { rubric, practicalTask } from "../../shared/assessment.js";
import { questions } from "../../server/src/questions.js";
import { videoAnalysisAvailable } from "../../server/src/video.js";
import { syntheticVideo } from "../../server/test/helpers/video.js";
import { syntheticRatings } from "../../shared/consistency.js";
import type { ImageStorage } from "../../server/src/evidence.js";

test(
  "React end-to-end: offline quiz and rubric reload → reconnect → human sign-off → private Passport → admin audit",
  { timeout: 180000 },
  async () => {
    // Runs local source in an isolated DOM, not through a browser or a user-owned tab.
    const dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      { url: "http://127.0.0.1:5173/start", pretendToBeVisual: true },
    );
    const window = dom.window;
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
      CustomEvent: window.CustomEvent,
      XMLHttpRequest: window.XMLHttpRequest,
      FormData: window.FormData,
      File: window.File,
      FileReader: window.FileReader,
      Blob: window.Blob,
      URL: window.URL,
      getComputedStyle: window.getComputedStyle.bind(window),
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
    }))
      Object.defineProperty(globalThis, name, {
        value,
        writable: true,
        configurable: true,
      });
    window.scrollTo = () => {};
    let online = true;
    Object.defineProperty(window.navigator, "onLine", {
      get: () => online,
      configurable: true,
    });
    const connectivity = (value: boolean) => {
      online = value;
      window.dispatchEvent(new window.Event(value ? "online" : "offline"));
    };
    let prints = 0;
    window.print = () => {
      prints++;
    };
    let objectId = 0;
    window.URL.createObjectURL = () => `blob:ui-test-${++objectId}`;
    window.URL.revokeObjectURL = () => {};
    const databaseName = `dakshsetu_test_${randomUUID().replaceAll("-", "")}`;
    const { connection, models } = await connectDatabase(
      `mongodb://127.0.0.1:27027/${databaseName}`,
    );
    let uploaded = 0,
      uploadedVideos = 0;
    const storage: ImageStorage = {
      configured: true,
      async upload(_image, id) {
        uploaded++;
        return {
          url:
            "https://res.cloudinary.com/test/image/authenticated/v1/" +
            id +
            ".jpg",
          publicId: id,
        };
      },
      async remove() {},
      async uploadVideo(_video, id) {
        uploadedVideos++;
        return {
          url: "https://res.cloudinary.com/test/video/authenticated/" + id,
          publicId: id,
        };
      },
      async removeVideo() {},
    };
    const fetcher: typeof fetch = async (_url, init) => {
      const image = String(init?.body).includes("inlineData");
      const output = image
        ? {
            observations: rubric.map((r) => ({
              criterionId: r.id,
              status: "unclear",
              confidence: 0.9,
            })),
            warnings: ["A still image cannot demonstrate the full procedure."],
            suggestedScore: 4,
            maxScore: 10,
            summary: "Visible evidence is limited.",
            limitations: ["Isolation and testing are not verified."],
          }
        : {
            trade: "Electrician",
            skills: [
              "Residential Wiring",
              "MCB Installation",
              "Switch Installation",
              "Fault Diagnosis",
            ],
            summary: "Domestic electrical experience.",
          };
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(output) }] } },
          ],
        }),
      );
    };
    await seedDatabase(models);
    const app = createApp(models, {
      jwtSecret: randomUUID(),
      clientUrls: ["http://127.0.0.1:5173"],
      test: true,
      ai: { apiKey: "test-key", model: "test", fetcher },
      imageStorage: storage,
      publicAppUrl: "http://127.0.0.1:5173",
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) =>
      server.once("listening", () => resolve()),
    );
    const { render, screen, within, waitFor, cleanup } = await import(
      "@testing-library/react"
    );
    const userEvent = (await import("@testing-library/user-event")).default;
    const user = userEvent.setup({ document: window.document });
    const { api } = await import("../src/services/api");
    const offline = await import("../src/services/offline");
    const device = new offline.OfflineDatabase("workflow-test-" + randomUUID());
    offline.useOfflineDatabaseForTest(device);
    api.defaults.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    await import("../src/pages/Passport");
    await import("../src/pages/Assessor");
    await import("../src/pages/Admin");
    await import("../src/pages/Quality");
    await import("../src/pages/Verify");
    const App = (await import("../src/App")).default;
    const eventual = (condition: boolean) => {
      if (!condition) throw new Error("Waiting for state update");
    };
    const email = `react-ui-${randomUUID()}@example.test`;
    const click = async (name: string | RegExp) =>
      user.click(
        await screen.findByRole(
          "button",
          { name, exact: typeof name === "string" },
          { timeout: 15000 },
        ),
      );
    try {
      console.log("Workflow checkpoint: render start");
      render(<App />);
      await screen.findByRole("heading", { name: "Choose your language" });
      await click("Continue");
      await user.click(
        await screen.findByRole("link", {
          name: "Create your account",
          exact: true,
        }),
      );
      await user.type(
        screen.getByLabelText("Full name", { exact: true }),
        "React UI Worker",
      );
      await user.type(
        screen.getByLabelText("Mobile number", { exact: true }),
        "9876543210",
      );
      await user.type(
        screen.getByLabelText("Email address", { exact: true }),
        email,
      );
      await user.type(
        screen.getByLabelText("Password", { exact: true }),
        "uitest123",
      );
      await click("Create your account");
      await screen.findByRole(
        "heading",
        { name: "What work do you do?" },
        { timeout: 15000 },
      );
      await click("Electrician");
      await click("Continue");
      await screen.findByRole("heading", {
        name: "How many years have you done this work?",
      });
      await click(/5\+ years/);
      await click("Continue");
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
                  [
                    {
                      transcript:
                        "I do house wiring, install switches and MCBs and diagnose electrical faults.",
                    },
                  ],
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
      Object.defineProperty(window, "SpeechRecognition", {
        value: RecognitionContract,
        configurable: true,
      });
      await click("Tap and speak");
      await waitFor(() =>
        eventual(
          (
            screen.getByLabelText("Describe your work", {
              exact: true,
            }) as HTMLTextAreaElement
          ).value.includes("I do house wiring"),
        ),
      );
      console.log("Workflow checkpoint: voice");
      await click("Stop recording");
      await click("Analyse my experience");
      await screen.findByRole(
        "heading",
        { name: "We found your skills" },
        { timeout: 15000 },
      );
      await click("Yes, continue");
      await screen.findByRole(
        "heading",
        { name: "This skill profile matches you best" },
        { timeout: 15000 },
      );
      await click("Continue to self-assessment");
      await screen.findByRole("heading", { name: questions[0].question });
      console.log("Workflow checkpoint: offline");
      connectivity(false);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await screen.findByRole("heading", { name: q.question });
        await click(
          new RegExp(
            q.options[q.correctAnswer].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ),
        );
        await click(i === questions.length - 1 ? "Review answers" : "Continue");
      }
      await screen.findByRole("heading", { name: "Review answers" });
      await click("Submit assessment");
      await screen.findByText(
        "Saved on this device. Your assessment will submit when the connection returns.",
      );
      const offlineWorker = await models.User.findOne({ email }).lean();
      assert.equal(
        await models.Assessment.countDocuments({ workerId: offlineWorker!.id }),
        0,
      );
      cleanup();
      window.history.replaceState({}, "", "/worker/quiz");
      render(<App />);
      await screen.findByRole("heading", { name: "Review answers" });
      await screen.findByText(
        "Your submission is waiting to sync. No final score is available yet.",
      );
      assert.equal((await offline.pendingItems(offlineWorker!.id)).length, 1);
      connectivity(true);
      await screen.findByRole(
        "heading",
        { name: "Self-assessment complete" },
        { timeout: 15000 },
      );
      const worker = await models.User.findOne({ email }).lean();
      assert.ok(worker);
      assert.equal(
        (await models.Profile.findOne({ userId: worker.id }).lean())!
          .declarationSource,
        "voice",
      );
      assert.ok(
        await models.AuditLog.exists({
          actorId: worker.id,
          action: "VOICE_TRANSCRIPT_SAVED",
        }),
      );
      assert.equal(
        (await models.Assessment.findOne({ workerId: worker.id }).lean())!
          .selfAssessmentScore,
        100,
      );
      await click("Sign out");
      await user.click(
        await screen.findByRole("link", { name: "Home", exact: true }),
      );
      await user.click(
        await screen.findByRole("link", { name: /For assessors/ }),
      );
      await screen.findByRole("heading", { name: "Assessor sign in" });
      await click("Use demo assessor account");
      await click("Sign in");
      await screen.findByRole(
        "heading",
        { name: "Dashboard" },
        { timeout: 15000 },
      );
      await user.click(
        await screen.findByRole("link", { name: /React UI Worker/ }),
      );
      await screen.findByRole("heading", { name: "React UI Worker" });
      console.log("Workflow checkpoint: claim");
      await click("Start assessment");
      await screen.findByRole("heading", { name: practicalTask });
      for (const r of rubric) {
        const group = screen.getByRole("group", {
          name: new RegExp(r.criterion),
        });
        await user.click(
          within(group).getByRole("radio", {
            name: /3 Independently demonstrated/,
          }),
        );
      }
      await user.click(
        within(
          screen.getByRole("group", { name: new RegExp(rubric[0].criterion) }),
        ).getByRole("radio", { name: /1/ }),
      );
      console.log("Workflow checkpoint: offline");
      connectivity(false);
      await click("Save practical scores");
      await screen.findByText(
        "Saved on this device. Practical scores will sync when the connection returns.",
      );
      console.log("Workflow checkpoint: saved practical");
      const pendingAssessment = await models.Assessment.findOne({
        workerId: worker.id,
      }).lean();
      assert.equal(pendingAssessment!.practical, undefined);
      const assessorUser = await models.User.findOne({
        email: "assessor@dakshsetu.demo",
      }).lean();
      await waitFor(async () =>
        eventual((await offline.pendingItems(assessorUser!.id)).length === 1),
      );
      cleanup();
      window.history.replaceState(
        {},
        "",
        "/assessor/candidates/" + worker.id + "?tab=assessment",
      );
      render(<App />);
      await screen.findByRole("heading", { name: practicalTask });
      await waitFor(() =>
        eventual(
          screen.getAllByRole("radio", { checked: true }).length ===
            rubric.length,
        ),
      );
      connectivity(true);
      console.log("Workflow checkpoint: reconnect practical");
      await waitFor(
        async () =>
          eventual(
            (await models.Assessment.findOne({ workerId: worker.id }).lean())!
              .practicalScore === 90,
          ),
        { timeout: 15000 },
      );
      await waitFor(async () =>
        eventual((await offline.pendingItems(assessorUser!.id)).length === 0),
      );
      console.log("Workflow checkpoint: evidence");
      await click("Evidence");
      const fixture = await sharp({
        create: { width: 120, height: 100, channels: 3, background: "#c5d4e8" },
      })
        .png()
        .toBuffer();
      console.log("Workflow checkpoint: offline");
      connectivity(false);
      await user.upload(
        screen.getByLabelText("Choose practical evidence", { exact: true }),
        new window.File(
          [new Uint8Array(fixture)],
          "synthetic-ui-evidence.png",
          { type: "image/png" },
        ),
      );
      await click("Save evidence on device");
      await screen.findByText(
        "Media saved on this device. It will upload when the connection returns.",
      );
      assert.equal(
        await models.Evidence.countDocuments({
          assessmentId: pendingAssessment!.id,
        }),
        0,
      );
      cleanup();
      window.history.replaceState(
        {},
        "",
        "/assessor/candidates/" + worker.id + "?tab=evidence",
      );
      render(<App />);
      await screen.findByRole("heading", { name: "React UI Worker" });
      await screen.findByRole("heading", { name: "Media waiting to sync" });
      connectivity(true);
      await screen.findByText(
        "Evidence uploaded and saved.",
        { exact: true },
        { timeout: 15000 },
      );
      assert.equal(uploaded, 1);
      await click("Run AI observation");
      await screen.findByText(
        "AI observation saved. Review its limitations before making your decision.",
        { exact: true },
        { timeout: 15000 },
      );
      if (await videoAnalysisAvailable()) {
        console.log("Workflow checkpoint: real video frames");
        const clip = await syntheticVideo();
        try {
          await user.upload(
            screen.getByLabelText("Choose short practical video", {
              selector: "input",
            }),
            new window.File(
              [new Uint8Array(clip.bytes)],
              "synthetic-ui-video.mp4",
              { type: "video/mp4" },
            ),
          );
          await click("Upload video");
          await screen.findByRole(
            "heading",
            { name: "synthetic-ui-video.mp4" },
            { timeout: 15000 },
          );
          await waitFor(() =>
            eventual(
              !(
                screen.getByRole("button", {
                  name: "Analyse representative frames",
                }) as HTMLButtonElement
              ).disabled,
            ),
          );
          await click("Analyse representative frames");
          await screen.findByText(
            "Video observations saved. Suggested only; the assessor decides.",
            {},
            { timeout: 30000 },
          );
          await screen.findByText(/Sample positions \(seconds\)/);
          assert.equal(uploadedVideos, 1);
          const video = await models.Evidence.findOne({
            assessmentId: pendingAssessment!.id,
            type: "video",
          }).lean();
          assert.equal((video!.analysis as any).frameTimes.length, 6);
          assert.equal(
            await models.AIAnalysis.countDocuments({
              assessmentId: pendingAssessment!.id,
              type: "video",
            }),
            1,
          );
        } finally {
          await clip.cleanup();
        }
      }
      await click("Recommendation");
      const practicalInput = screen.getByLabelText(
        /Final practical score \(0–100\)/,
      );
      await user.clear(practicalInput);
      await user.type(practicalInput, "90");
      await user.type(
        screen.getByLabelText(/Reason for your adjustment/),
        "Synthetic UI test: human review covers the full procedure beyond this limited image.",
      );
      await user.click(
        screen.getByRole("checkbox", {
          name: /I confirm that I have reviewed/,
        }),
      );
      await click("Finalise assessment");
      await screen.findByText(
        "Assessment signed off. The record is now locked.",
        { exact: true },
        { timeout: 15000 },
      );
      const final = await models.Assessment.findOne({
        workerId: worker.id,
      }).lean();
      assert.equal(final!.status, "SIGNED_OFF");
      assert.equal(final!.finalScore, 93);
      assert.equal(final!.aiSuggestedScore, 40);
      assert.ok(final!.overrideReason?.includes("Synthetic UI test"));
      await click("Assessment");
      assert.equal(
        screen.getAllByRole("radio").every((r) => r.matches(":disabled")),
        true,
      );
      await click("Recommendation");
      await user.click(
        await screen.findByRole("link", { name: "View Skill Passport" }),
      );
      await screen.findByText(
        "Prototype skill record · Not a government certificate",
      );
      assert.ok(screen.getByText("93%", { exact: true }));
      console.log("Workflow checkpoint: passport");
      await click("Print / Save PDF");
      assert.equal(prints, 1);
      await click("Sign out");
      await user.click(
        await screen.findByRole("link", {
          name: "Register / Login",
          exact: true,
        }),
      );
      await user.type(
        await screen.findByLabelText("Email address", { exact: true }),
        email,
      );
      await user.type(
        screen.getByLabelText("Password", { exact: true }),
        "uitest123",
      );
      await click("Sign in");
      await screen.findByRole(
        "heading",
        { name: "Self-assessment complete" },
        { timeout: 15000 },
      );
      await screen.findByRole("heading", { name: "Assessor verified" });
      assert.ok(screen.getByText("93%", { exact: true }));
      cleanup();
      window.history.replaceState({}, "", "/worker");
      render(<App />);
      await screen.findByRole(
        "heading",
        { name: "Assessor verified" },
        { timeout: 15000 },
      );
      await user.click(
        await screen.findByRole("link", { name: "View Skill Passport" }),
      );
      await screen.findByText(
        "Prototype skill record · Not a government certificate",
      );
      assert.equal(
        await models.SkillPassport.countDocuments({ workerId: worker.id }),
        1,
      );
      console.log("Workflow checkpoint: reassessment");
      const originalRecord = await models.Assessment.findOne({
        workerId: worker.id,
      }).lean();
      await click("Request reassessment");
      await waitFor(async () =>
        eventual(
          (await models.Reassessment.countDocuments({
            workerId: worker.id,
            status: "PENDING",
          })) === 1,
        ),
      );
      await click("Sign out");
      cleanup();
      window.history.replaceState({}, "", "/login?role=assessor");
      render(<App />);
      await screen.findByRole("heading", { name: "Assessor sign in" });
      await click("Use demo assessor account");
      await click("Sign in");
      await screen.findByRole(
        "heading",
        { name: "Dashboard" },
        { timeout: 15000 },
      );
      cleanup();
      window.history.replaceState({}, "", "/passports/" + final!.id);
      render(<App />);
      const newEvidence = await sharp({
        create: { width: 60, height: 60, channels: 3, background: "#ffaa00" },
      })
        .png()
        .toBuffer();
      await user.upload(
        await screen.findByLabelText("Upload new reassessment evidence"),
        new window.File([new Uint8Array(newEvidence)], "new-proof.png", {
          type: "image/png",
        }),
      );
      await screen.findByRole(
        "button",
        { name: "View evidence 1" },
        { timeout: 15000 },
      );
      await user.selectOptions(
        screen.getByLabelText("Reassessment rating"),
        "3",
      );
      await user.type(
        screen.getByLabelText("Reassessment observation"),
        "New supervised practical evidence demonstrates this competency.",
      );
      await user.click(
        screen.getByLabelText(
          "I personally assessed this competency using the new evidence.",
        ),
      );
      await click("Complete reassessment");
      await screen.findByRole(
        "heading",
        { name: "Reassessment history" },
        { timeout: 15000 },
      );
      assert.deepEqual(
        await models.Assessment.findOne({ workerId: worker.id }).lean(),
        originalRecord,
      );
      assert.equal(
        (await models.Credential.findOne({ workerId: worker.id }).lean())!
          .revision,
        2,
      );
      let sharedUrl = "";
      Object.defineProperty(window.navigator, "share", {
        configurable: true,
        value: async (data: { url: string }) => {
          sharedUrl = data.url;
        },
      });
      await click("Share");
      assert.match(sharedUrl, /\/verify\/DS-RPL-/);
      let pdfDownloads = 0;
      window.HTMLAnchorElement.prototype.click = function () {
        pdfDownloads++;
      };
      await click("Download PDF");
      await waitFor(() => eventual(pdfDownloads === 1), { timeout: 15000 });
      await user.click(
        screen.getByRole("link", { name: "Open verification page" }),
      );
      await screen.findByRole("heading", { name: "VALID" }, { timeout: 15000 });
      await screen.findByRole("heading", {
        name: /Overall competency score.*93%/,
      });
      await click("Sign out");
      cleanup();
      window.history.replaceState({}, "", "/login?role=admin");
      render(<App />);
      await screen.findByRole("heading", { name: "Administrator sign in" });
      await click("Use demo administrator account");
      await click("Sign in");
      await screen.findByRole(
        "heading",
        { name: "Total workers" },
        { timeout: 15000 },
      );
      await user.click(screen.getByText("More tools", { selector: "summary" }));
      await user.click(
        screen.getByRole("link", { name: "Audit log", exact: true }),
      );
      await screen.findByRole("heading", { name: "Audit log" });
      await screen.findAllByText(
        "ASSESSMENT_SIGNED_OFF",
        {},
        { timeout: 15000 },
      );
      console.log("Workflow checkpoint: quality");
      await user.click(
        screen.getByText("Quality tools", { selector: "summary" }),
      );
      await user.click(
        screen.getByRole("link", { name: "Assessor Consistency", exact: true }),
      );
      await screen.findByRole("heading", { name: "Assessor Consistency" });
      await screen.findByRole("heading", { name: "Not enough data yet" });
      assert.equal(await models.ConsistencyDataset.countDocuments(), 0);
      await click("Use Demo Dataset");
      await screen.findByRole("heading", { name: "Demo Mode" });
      await screen.findByText(
        "Demonstration data only. Synthetic ratings, not collected from real assessors.",
      );
      assert.equal(await models.ConsistencyDataset.countDocuments(), 0);
      await click("Return to actual data");
      await screen.findByRole("heading", { name: "Not enough data yet" });
      const csv =
        "case_id,assessor_id,condition,score\n" +
        syntheticRatings()
          .map((r) => [r.caseId, r.assessorId, r.condition, r.score].join(","))
          .join("\n");
      const csvFile = new window.File([csv], "synthetic-ui-test.csv", {
        type: "text/csv",
      });
      Object.defineProperty(csvFile, "text", { value: async () => csv });
      await user.upload(
        screen.getByLabelText("Upload Ratings CSV", { selector: "input" }),
        csvFile,
      );
      await screen.findByRole(
        "heading",
        { name: "Paired ratings available" },
        { timeout: 15000 },
      );
      assert.equal(await models.ConsistencyDataset.countDocuments(), 1);
      await user.click(
        screen.getByText("Create a calibration practice case", {
          selector: "summary",
        }),
      );
      await user.type(
        screen.getByLabelText("Case title"),
        "Synthetic UI calibration",
      );
      await user.type(
        screen.getByLabelText("Case scenario"),
        "Synthetic practice scenario for consistent assessment of a training board.",
      );
      const practiceForm = screen.getByLabelText("Case title").closest("form")!;
      for (const select of within(practiceForm).getAllByRole("combobox"))
        await user.selectOptions(select, "2");
      await click("Create practice case");
      await screen.findByText("Practice case created.", {}, { timeout: 15000 });
      await click("Sign out");
      cleanup();
      window.history.replaceState({}, "", "/login?role=assessor");
      render(<App />);
      await screen.findByRole("heading", { name: "Assessor sign in" });
      await click("Use demo assessor account");
      await click("Sign in");
      await screen.findByRole(
        "heading",
        { name: "Dashboard" },
        { timeout: 15000 },
      );
      await user.click(
        screen.getByRole("link", { name: "Calibration practice" }),
      );
      await screen.findByRole("heading", { name: "Calibration practice" });
      await screen.findByRole(
        "option",
        { name: "Synthetic UI calibration" },
        { timeout: 15000 },
      );
      await user.selectOptions(
        screen.getByLabelText("Choose a case"),
        (await models.CalibrationCase.findOne({
          title: "Synthetic UI calibration",
        }).lean())!.id,
      );
      const calibrationForm = screen
        .getByRole("button", { name: "Submit practice ratings" })
        .closest("form")!;
      for (const select of within(calibrationForm).getAllByRole("combobox"))
        await user.selectOptions(select, "3");
      await click("Submit practice ratings");
      await screen.findByRole(
        "heading",
        { name: "Practice comparison" },
        { timeout: 15000 },
      );
      assert.equal(
        await models.CalibrationScore.countDocuments({
          condition: "calibration",
        }),
        1,
      );
      console.log(
        "PASS: the real React screens completed the worker and assessor flow through a real Express/MongoDB test API. Provider transports were controlled test doubles; live providers are tested separately.",
      );
    } finally {
      cleanup();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      assert.equal(connection.name, databaseName);
      await connection.dropDatabase();
      await connection.close();
      device.close();
      await device.delete();
      offline.useOfflineDatabaseForTest(undefined);
      dom.window.close();
    }
  },
);
