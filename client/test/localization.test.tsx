import { test } from "node:test";
import "../src/locales/register-practical";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { qualification } from "../../shared/data";
import {
  rubric,
  scoreLabels,
  recommendations,
  practicalTask,
} from "../../shared/assessment";
import { messages } from "../src/locales/messages";
import { copy } from "../src/i18n";
import { translate, hasTranslation } from "../src/localization";
import type { Language } from "../../shared/types";

test("translation catalogs cover UI literals, rubric, recommendations and both supported locales", () => {
  const keys = new Set<string>();
  for (const [en, hi, mr] of messages) {
    assert.ok(!keys.has(en), `Duplicate message: ${en}`);
    keys.add(en);
    assert.match(hi, /[\u0900-\u097f]/, `Missing Hindi: ${en}`);
    assert.match(mr, /[\u0900-\u097f]/, `Missing Marathi: ${en}`);
    const params = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(params(hi), params(en));
    assert.deepEqual(params(mr), params(en));
  }
  const files = [
    "client/src/App.tsx",
    ...["pages", "components"].flatMap((d) =>
      readdirSync("client/src/" + d)
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => "client/src/" + d + "/" + f),
    ),
  ];
  const allow = new Set(["ABCD", "Ramesh Patil", "you@example.com"]);
  const missing = new Set<string>();
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "tr" &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const text = node.arguments[0].text.trim().replace(/\s+/g, " ");
        if (
          /[A-Za-z]{3}/.test(text) &&
          !allow.has(text) &&
          !hasTranslation(text)
        )
          missing.add(text);
      }
      if (ts.isJsxText(node) && /[A-Za-z]{3}/.test(node.text))
        missing.add("Untranslated JSX in " + file + ": " + node.text.trim());
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const text of [
    practicalTask,
    ...rubric.flatMap((r) => [r.criterion, r.section]),
    ...scoreLabels,
    ...recommendations,
    qualification.title,
    ...qualification.nos,
  ])
    if (!hasTranslation(text)) missing.add(text);
  assert.deepEqual([...missing], []);
  assert.equal(
    translate("String must contain at least 6 character(s)", "hi"),
    "कम से कम 6 अक्षर लिखें।",
  );
  assert.equal(
    translate("Use at least {count} characters.", "mr", { count: 6 }),
    "किमान 6 अक्षरे लिहा.",
  );
  assert.equal(
    translate("Array must contain at most 20 element(s)", "hi"),
    "अधिकतम 20 विकल्प चुनें।",
  );
  assert.equal(
    translate("Number must be less than or equal to 100", "mr"),
    "जास्तीत जास्त 100 ही संख्या द्या.",
  );
  assert.equal(
    translate(
      "Invalid email. String must contain at least 6 character(s)",
      "hi",
    ),
    "सही ईमेल पता दर्ज करें · कम से कम 6 अक्षर लिखें।",
  );
  assert.equal(
    translate(translate("Evidence uploaded and saved.", "hi"), "mr"),
    translate("Evidence uploaded and saved.", "mr"),
  );
});

test(
  "every public, worker, assessor, Passport and admin page switches fully between Hindi and Marathi",
  { timeout: 120000 },
  async () => {
    const dom = new JSDOM(
      '<!doctype html><html><head><meta name="description" /></head><body></body></html>',
      { url: "http://127.0.0.1:5173/", pretendToBeVisual: true },
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
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.URL.createObjectURL = () => "blob:localization-test";
    window.URL.revokeObjectURL = () => {};
    const { render, screen, waitFor, cleanup } = await import(
      "@testing-library/react"
    );
    const user = (await import("@testing-library/user-event")).default.setup({
      document: window.document,
    });
    const { api } = await import("../src/services/api");
    await import("../src/pages/Passport");
    await import("../src/pages/Admin");
    await import("../src/pages/Verify");
    await import("../src/pages/Quality");
    const App = (await import("../src/App")).default;
    const time = "2026-10-17T04:30:00.000Z";
    const worker = {
      id: "worker-id",
      name: "Original Worker",
      email: "worker@example.test",
      phone: "9876543210",
      role: "worker",
      preferredLanguage: "en",
      createdAt: time,
      updatedAt: time,
    };
    const assessor = {
      ...worker,
      id: "assessor-id",
      role: "assessor",
      name: "Original Assessor",
    };
    const admin = {
      ...worker,
      id: "admin-id",
      role: "admin",
      name: "Original Admin",
    };
    const profile = {
      id: "profile-id",
      userId: worker.id,
      state: "",
      district: "",
      trade: "Electrician",
      yearsExperience: 8,
      experienceDescription: "Original worker description.",
      detectedSkills: qualification.skills,
      confirmedSkills: qualification.skills,
      selectedQualificationId: qualification.id,
      matchScore: 100,
      status: "MAPPED",
      updatedAt: time,
      version: 1,
    };
    const assessment = {
      id: "assessment-id",
      workerId: worker.id,
      qualificationId: qualification.id,
      status: "IN_ASSESSMENT",
      assessorId: assessor.id,
      version: 1,
      practical: {
        taskTitle: practicalTask,
        rubricScores: rubric.map((r) => ({
          criterionId: r.id,
          score: 3,
          remark: "Original remark.",
        })),
        rubricScore: 100,
        updatedAt: time,
      },
      practicalScore: 100,
      aiSuggestedScore: 40,
      aiObservation: {
        evidenceId: "evidence-id",
        observations: rubric.map((r) => ({
          criterionId: r.id,
          criterion: r.criterion,
          status: "unclear",
          confidence: 0.9,
        })),
        warnings: ["Original warning."],
        summary: "Original observation.",
        limitations: ["Original limitation."],
        suggestedScore: 4,
        maxScore: 10,
        createdAt: time,
      },
      selfAssessmentScore: 100,
      responses: [],
      competencyScores: [],
      profileVersion: 1,
      evidenceIds: ["evidence-id"],
      history: [
        { action: "ASSESSMENT_STARTED", actorId: assessor.id, at: time },
      ],
      createdAt: time,
      updatedAt: time,
    };
    const evidence = {
      id: "evidence-id",
      assessmentId: assessment.id,
      uploadedBy: assessor.id,
      type: "image",
      filename: "proof.png",
      url: "",
      cloudinaryPublicId: "test",
      mimeType: "image/jpeg",
      size: 100,
      originalHash: "test",
      createdAt: time,
    };
    let currentRole = "worker",
      currentPath = "/",
      signed = false;
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      // Yield like an actual network response, allowing lazy-route work to flush.
      await new Promise((resolve) => setTimeout(resolve, 1));
      const a = signed
        ? {
            ...assessment,
            status: "SIGNED_OFF",
            finalScore: 93,
            assessorScore: 90,
            recommendation: "Competent",
            signedOffAt: time,
          }
        : assessment;
      const candidate = {
        user: worker,
        profile,
        assessment: a,
        qualification,
        evidence: [evidence],
        assessorName: assessor.name,
      };
      let data: unknown;
      switch (config.url) {
        case "/credentials/assessment/assessment-id":
          data = {
            credentialId: "DS-RPL-2026-1234567890ABCDEF1234567890ABCDEF",
            status: "ACTIVE",
            issuedAt: time,
            revision: 1,
            verificationPath:
              "/verify/DS-RPL-2026-1234567890ABCDEF1234567890ABCDEF",
            verificationUrl:
              "https://dakshsetu.example/verify/DS-RPL-2026-1234567890ABCDEF1234567890ABCDEF",
            history: [],
            competencies: [],
          };
          break;
        case "/credentials/DS-RPL-2026-1234567890ABCDEF1234567890ABCDEF/verify":
          data = {
            credentialId: "DS-RPL-2026-1234567890ABCDEF1234567890ABCDEF",
            status: "VALID",
            revision: 1,
            workerName: worker.name,
            trade: "Electrician",
            assessmentDate: time,
            overallScore: 93,
            verifiedCompetencies: [
              { name: "Safety", score: 100, source: "self-assessment" },
            ],
            prototype: true,
          };
          break;
        case "/assessments/assessment-id/videos":
          data = { items: [], analysisAvailable: false };
          break;
        case "/auth/me":
          data =
            currentRole === "assessor"
              ? assessor
              : currentRole === "admin"
                ? admin
                : worker;
          break;
        case "/manage/analytics":
          data = {
            workers: 1,
            assessors: 1,
            total: 1,
            pending: 0,
            inProgress: 0,
            completed: 1,
            competentRate: 100,
            aiOverrideRate: null,
            trades: [],
            districts: [],
            gaps: [],
          };
          break;
        case "/settings/public":
          data = { languages: ["en", "hi", "mr"], demoEnabled: true };
          break;
        case "/workers/portal":
          data = { assessment: a, assessorName: assessor.name, evidence: [] };
          break;
        case "/manage/assessors":
          data = [];
          break;
        case "/manage/batches":
          data = { items: [] };
          break;
        case "/manage/passports":
          data = { items: [], total: 0 };
          break;
        case "/manage/calibration":
          data = { cases: [], scores: [], assessors: [] };
          break;
        case "/manage/sync":
          data = { devices: [], media: [] };
          break;
        case "/manage/settings":
          data = {
            id: "system",
            version: 0,
            languages: ["en", "hi", "mr"],
            demoEnabled: true,
            activeQualificationId: "demo-ele-001",
            policy: {
              selfWeight: 0.3,
              practicalWeight: 0.7,
              competent: 75,
              minorGap: 60,
              furtherAssessment: 40,
            },
          };
          break;
        case "/admin/stats":
          data = {
            workers: 1,
            assessors: 1,
            total: 1,
            active: 0,
            completed: 1,
            pending: 0,
          };
          break;
        case "/admin/quality":
          data = {
            datasets: [],
            assessors: 1,
            completed: 0,
            scoreOverrides: 0,
            aiAgreement: null,
            aiPairs: 0,
            averages: [],
          };
          break;
        case "/calibration/cases":
          data = [];
          break;
        case "/reassessments/assessment/assessment-id":
          data = { items: [], weak: [] };
          break;
        case "/manage/qualifications":
        case "/admin/qualifications":
          data = [qualification];
          break;
        case "/manage/users":
        case "/admin/users":
          data = { items: [worker, assessor, admin], total: 3 };
          break;
        case "/manage/assessments":
        case "/admin/assessments":
          data = { items: [a], total: 1 };
          break;
        case "/admin/audit-log":
          data = {
            items: [
              {
                id: "audit-id",
                actorId: assessor.id,
                actorRole: "assessor",
                assessmentId: a.id,
                action: "ASSESSMENT_SIGNED_OFF",
                oldValue: "IN_ASSESSMENT",
                newValue: "SIGNED_OFF",
                metadata: {},
                createdAt: time,
              },
            ],
            total: 1,
          };
          break;
        case "/passports/assessment-id":
          data = {
            id: "passport-id",
            workerId: worker.id,
            assessmentId: a.id,
            workerName: worker.name,
            trade: profile.trade,
            qualificationTitle: qualification.title,
            qualificationCode: qualification.code,
            nsqfLevel: qualification.nsqfLevel,
            assessorName: assessor.name,
            overallScore: 93,
            selfAssessmentScore: 100,
            practicalScore: 90,
            recommendation: "Competent",
            signedOffAt: time,
            generatedAt: time,
            competencyScores: [{ name: "Safety", score: 100 }],
            practicalCriteria: rubric.map((r) => ({
              criterion: r.criterion,
              section: r.section,
              score: 3,
              maxScore: 3,
              weight: r.weight,
            })),
            declaredSkills: qualification.skills,
            strengths: rubric.map((r) => r.criterion),
            gaps: [],
          };
          break;
        case "/workers/me":
          data = {
            user: worker,
            profile,
            assessment: currentPath.includes("result") ? a : null,
          };
          break;
        case "/qualifications/" + qualification.id:
          data = qualification;
          break;
        case "/self-assessment/questions/" + qualification.id:
          data = [
            {
              id: "q1",
              question: "Fixture question",
              options: ["First", "Second"],
              competency: "Safety",
              weight: 1,
            },
          ];
          break;
        case "/assessor/dashboard":
          data = {
            assigned: 1,
            available: 1,
            pending: 1,
            completed: 1,
            requiresReview: 0,
          };
          break;
        case "/assessor/candidates":
          data = [candidate];
          break;
        case "/assessor/candidates/worker-id":
          data = candidate;
          break;
        default:
          if (config.url?.endsWith("/content"))
            data = new window.Blob(["test"], { type: "image/jpeg" });
          else throw Error("Unexpected test request: " + config.url);
      }
      return { data, status: 200, statusText: "OK", headers: {}, config };
    };
    const originals = [
      "Original Worker",
      "Original Assessor",
      "Original worker description.",
      "Original observation.",
      "Original warning.",
      "Original limitation.",
      "Original remark.",
      "Original voice transcript.",
      "proof.png",
      "Ramesh Patil",
      "you@example.com",
      "DEMO-ELE-001",
      "demo-ele-001",
      "PSS/Q6001",
      "DS-RPL-2026-1234567890ABCDEF1234567890ABCDEF",
      "Original Admin",
      "worker-id",
      "assessor-id",
      "admin-id",
      "assessment-id",
      "passport-id",
      "worker@example.test",
    ];
    const assertLocalized = (language: Language, route: string) => {
      assert.equal(window.document.documentElement.lang, language);
      const failures = new Set<string>();
      const check = (text: string) => {
        let remaining = text;
        for (const value of originals)
          remaining = remaining.replaceAll(value, "");
        remaining = remaining.replace(
          /DakshSetu|DAKSHSETU|DigiLocker|Gemini|MongoDB|Cloudinary|WebP|WebM|MP4|JPEG|PNG|EXIF|NSQF|SIH|RPL|UTF|PDF|AI|MB|case_id|assessor_id|criterion_id|condition|score|case-1|assessor-1|unassisted|assisted/g,
          "",
        );
        if (/[A-Za-z]{3}/.test(remaining)) failures.add(text.trim());
      };
      const walker = window.document.createTreeWalker(
        window.document.body,
        window.NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) check(walker.currentNode.textContent ?? "");
      for (const el of window.document.querySelectorAll(
        "[placeholder], [aria-label], [title], img[alt]",
      ))
        for (const attr of ["placeholder", "aria-label", "title", "alt"]) {
          const value = el.getAttribute(attr);
          if (value) check(value);
        }
      assert.deepEqual(
        [...failures],
        [],
        `${language} ${route} has English UI copy`,
      );
      assert.match(window.document.title, /[\u0900-\u097f]/);
    };
    const cases: [string, string, string][] = [
      ["/", "worker", ".hero h1"],
      ["/start", "worker", ".language-choices"],
      ["/login", "worker", ".auth-card h2"],
      ["/login/worker", "worker", ".auth-card h2"],
      ["/login/assessor", "assessor", ".auth-card h2"],
      ["/login/admin", "admin", ".auth-card h2"],
      ["/register", "worker", ".auth-card h2"],
      ["/login?role=assessor", "assessor", ".auth-card h2"],
      ["/login?role=admin", "admin", ".auth-card h2"],
      ["/passports/assessment-id", "worker", ".reassessment-ready"],
      [
        "/verify/DS-RPL-2026-1234567890ABCDEF1234567890ABCDEF",
        "worker",
        ".verify-record",
      ],
      ["/admin", "admin", ".stats-grid"],
      ["/admin/quality", "admin", ".quality-status"],
      ["/assessor/calibration", "assessor", ".panel"],
      ...["qualifications", "users", "assessments", "audit-log"].map(
        (s) =>
          ["/admin/" + s, "admin", ".candidate-table"] as [
            string,
            string,
            string,
          ],
      ),
      ...[
        "assessors",
        "passports",
        "calibration",
        "sync",
        "analytics",
        "settings",
        "batches",
      ].map(
        (s) =>
          [
            "/admin/" + s,
            "admin",
            s === "settings"
              ? ".admin-summary"
              : s === "analytics"
                ? ".stats-grid"
                : s === "calibration"
                  ? ".panel"
                  : ".candidate-table",
          ] as [string, string, string],
      ),
      ...[
        "dashboard",
        "profile",
        "myskills",
        "passport",
        "reassessment",
        "evidence",
      ].map(
        (s) =>
          ["/worker/" + s, "worker", ".worker-dashboard"] as [
            string,
            string,
            string,
          ],
      ),
      ["/about", "worker", ".faq-section"],
      ["/help", "worker", ".faq-section"],
      ["/missing", "worker", "h1"],
      ["/account", "admin", "h1"],
      ["/worker/trade", "worker", ".trade-grid"],
      ["/worker/years", "worker", ".years-grid"],
      ["/worker/describe", "worker", ".voice-box"],
      ["/worker/skills", "worker", ".skill-choices"],
      ["/worker/match", "worker", ".match-card"],
      ["/worker/quiz", "worker", ".answer-options"],
      ["/worker/result", "worker", ".result-view"],
      ["/assessor", "assessor", ".stats-grid"],
      ["/assessor/candidates", "assessor", ".candidate-table"],
      ["/assessor/assessments", "assessor", ".candidate-table"],
      ["/assessor/reports", "assessor", ".candidate-table"],
      ...["overview", "skills", "assessment", "evidence", "recommendation"].map(
        (tab) =>
          [
            `/assessor/candidates/worker-id?tab=${tab}`,
            "assessor",
            ".candidate-tabs",
          ] as [string, string, string],
      ),
    ];
    try {
      for (const language of ["hi", "mr"] as const) {
        for (const [path, role, selector] of cases) {
          cleanup();
          currentRole = role;
          currentPath = path;
          signed =
            path.includes("reports") ||
            path.includes("result") ||
            path.startsWith("/passports") ||
            path.startsWith("/admin");
          window.history.replaceState({}, "", path);
          window.localStorage.setItem("dakshsetu-language", language);
          if (
            path.startsWith("/worker") ||
            path.startsWith("/assessor") ||
            path.startsWith("/admin") ||
            path.startsWith("/passports") ||
            path === "/account"
          )
            window.sessionStorage.setItem("dakshsetu-token", "test-token");
          else window.sessionStorage.clear();
          render(<App />);
          await waitFor(
            () => {
              if (!window.document.querySelector(selector))
                throw new Error("Waiting for " + selector);
            },
            { timeout: 15000 },
          );
          assertLocalized(language, path);
          if (path === "/worker/describe") {
            class SpeechContract {
              lang = "";
              continuous = false;
              interimResults = false;
              onresult: any;
              onend: any;
              onerror: any;
              start() {
                assert.equal(this.lang, language === "hi" ? "hi-IN" : "mr-IN");
                queueMicrotask(() => {
                  this.onresult?.({
                    resultIndex: 0,
                    results: [
                      Object.assign(
                        [{ transcript: "Original voice transcript." }],
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
              value: SpeechContract,
              configurable: true,
            });
            await user.click(
              screen.getByRole("button", {
                name:
                  language === "hi" ? "बोलने के लिए दबाएं" : "बोलण्यासाठी दाबा",
                exact: true,
              }),
            );
            await waitFor(() =>
              assert.ok(
                (
                  window.document.querySelector(
                    "textarea",
                  ) as HTMLTextAreaElement
                ).value.includes("Original voice transcript."),
              ),
            );
            // Recognition remains active across browser session endings until Stop.
            await user.click(screen.getByRole("button", {
              name: language === "hi" ? copy.hi.stop : copy.mr.stop,
              exact: true,
            }));
            Object.defineProperty(window, "SpeechRecognition", {
              value: undefined,
              configurable: true,
            });
            await user.click(
              screen.getByRole("button", {
                name:
                  language === "hi" ? "बोलने के लिए दबाएं" : "बोलण्यासाठी दाबा",
                exact: true,
              }),
            );
            assert.ok(window.document.querySelector("textarea"));
            assertLocalized(language, path + " speech fallback");
          }
          if (path === "/register") {
            await user.click(
              screen.getByRole("button", {
                name:
                  language === "hi" ? "अपना खाता बनाएं" : "तुमचे खाते तयार करा",
                exact: true,
              }),
            );
            await waitFor(() =>
              assert.ok(window.document.querySelector(".field-error")),
            );
            assertLocalized(language, path + " validation");
          }
          if (path.includes("tab=recommendation")) {
            const select = screen.getByLabelText(
              language === "hi" ? "अंतिम सिफारिश" : "अंतिम शिफारस",
            ) as HTMLSelectElement;
            await user.selectOptions(select, "Not yet competent");
            assert.equal(
              select.value,
              "Not yet competent",
              "Translated text must not change API recommendation values",
            );
          }
        }
      }
      cleanup();
      window.sessionStorage.clear();
      window.localStorage.setItem("dakshsetu-language", "en");
      window.history.replaceState({}, "", "/");
      render(<App />);
      await screen.findByRole("heading", { name: /Your skills/ });
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Your language" }),
        "hi",
      );
      await screen.findByRole("heading", { name: /आपके कौशल/ });
      assertLocalized("hi", "live home switch");
      await user.click(screen.getByRole("link", { name: "मदद", exact: true }));
      await screen.findByRole("heading", { name: "हम कैसे मदद करें?" });
      await user.selectOptions(
        screen.getByRole("combobox", { name: "आपकी भाषा" }),
        "mr",
      );
      await screen.findByRole("heading", { name: "आम्ही कशी मदत करू?" });
      assertLocalized("mr", "live help switch");
      assert.equal(window.localStorage.getItem("dakshsetu-language"), "mr");
      cleanup();
      render(<App />);
      await screen.findByRole("heading", { name: "आम्ही कशी मदत करू?" });
      assertLocalized("mr", "restored locale");
      console.log(
        `PASS: ${cases.length} routes/states × 2 locales, form errors, canonical recommendation values, live switching and locale restoration.`,
      );
    } finally {
      cleanup();
      api.defaults.adapter = originalAdapter;
      dom.window.close();
    }
  },
);
