/**
 * Dedicated Discovery Engine for SSSF Studio.
 *
 * Turns rough ideas into structured, high-quality, human-approved markdown
 * specifications that feed directly into the Super Simple Software Factory.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProfileStore } from "./profiles.ts";
import type {
  ApprovalRecord,
  DiscoveryAmbiguityItem,
  DiscoveryAnalysis,
  DiscoveryAnalysisItem,
  DiscoveryChatMessage,
  DiscoveryQuestionItem,
  DiscoveryRiskItem,
  DiscoverySessionState,
  DiscoverySuggestionItem,
} from "../shared/types.ts";

export class DiscoveryEngine {
  private targetDir: string;
  private currentSession: DiscoverySessionState | null = null;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  setTargetDir(dir: string): void {
    this.targetDir = dir;
    this.currentSession = null;
  }

  getCurrentSession(): DiscoverySessionState {
    if (!this.currentSession) {
      const file = join(this.targetDir, ".sssf", "interview.json");
      try { this.currentSession = JSON.parse(readFileSync(file, "utf8")); } catch {}
      this.currentSession ??= this.createInitialSession();
      this.currentSession.isAnalyzing = false;
    }
    return this.currentSession;
  }

  private createInitialSession(): DiscoverySessionState {
    return {
      id: "disc-" + Math.random().toString(36).substring(2, 9),
      title: "New Discovery Specification",
      rawInput: "",
      specMarkdown: `# Specification: New Feature\n\n## Overview\n*Describe the high-level intent and problem statement here.*\n\n## Acceptance Criteria\n- [ ] Clean implementation satisfying the requirements\n- [ ] Quality commands pass (lint, build, tests)\n\n## Architectural Changes\n- Detail modified or newly introduced files.\n`,
      analysis: null,
      chatHistory: [
        {
          id: "msg-welcome",
          role: "assistant",
          content:
            "Welcome to Crew Platform. What do you want to create? Paste or upload a description, or tell me in your own words. We'll work through the important details one at a time.",
          timestamp: new Date().toISOString(),
        },
      ],
      isAnalyzing: false,
    };
  }

  resetSession(): DiscoverySessionState {
    this.currentSession = this.createInitialSession();
    this.persist();
    return this.currentSession;
  }

  async analyzeDescription(input: string): Promise<DiscoverySessionState> {
    if (!input.trim()) throw new Error("Describe what you want to create first.");
    const session = this.getCurrentSession();
    if (session.isAnalyzing) throw new Error("The interviewer is still answering. Please wait.");
    session.rawInput = input;
    session.isAnalyzing = true;

    // Derive a clean title
    const firstLine = input.trim().split("\n")[0]?.replace(/^[#\s*-]+/, "").slice(0, 60) || "Feature Specification";
    session.title = firstLine;

    // Add user message to history
    session.chatHistory.push({
      id: "msg-" + Date.now(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    });

    return this.interview();

  }

  async handleChatMessage(messageText: string): Promise<DiscoverySessionState> {
    const session = this.getCurrentSession();
    if (session.isAnalyzing) throw new Error("The interviewer is still answering. Please wait.");

    session.chatHistory.push({
      id: "msg-" + Date.now(),
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
    });

    return this.interview();

  }

  acceptSuggestion(suggestionId: string): DiscoverySessionState {
    const session = this.getCurrentSession();
    if (!session.analysis) return session;

    const suggestion = session.analysis.suggestions.find((s) => s.id === suggestionId);
    if (suggestion) {
      suggestion.status = "accepted";
      if (suggestion.patchMarkdown) {
        session.specMarkdown += `\n\n${suggestion.patchMarkdown}`;
      } else {
        session.specMarkdown += `\n\n### Adopted Suggestion: ${suggestion.title}\n${suggestion.description}\n`;
      }

      session.chatHistory.push({
        id: "msg-" + Date.now(),
        role: "assistant",
        content: `Applied suggestion: **${suggestion.title}** to the specification draft.`,
        timestamp: new Date().toISOString(),
      });
    }
    return session;
  }

  rejectSuggestion(suggestionId: string): DiscoverySessionState {
    const session = this.getCurrentSession();
    if (!session.analysis) return session;

    const suggestion = session.analysis.suggestions.find((s) => s.id === suggestionId);
    if (suggestion) {
      suggestion.status = "rejected";
      session.chatHistory.push({
        id: "msg-" + Date.now(),
        role: "assistant",
        content: `Dismissed suggestion: *${suggestion.title}*.`,
        timestamp: new Date().toISOString(),
      });
    }
    return session;
  }

  async answerQuestion(questionId: string, answer: string): Promise<DiscoverySessionState> {
    const question = this.getCurrentSession().analysis?.openQuestions.find(q => q.id === questionId);
    if (!question) throw new Error("That question has changed. Refresh the interview.");
    return this.handleChatMessage(question.question + "\nAnswer: " + answer);
  }

  updateSpecMarkdown(markdown: string): DiscoverySessionState {
    const session = this.getCurrentSession();
    session.specMarkdown = markdown;
    session.ready = false;
    this.persist();
    return session;
  }

  private persist(): void {
    const dir = join(this.targetDir, ".sssf");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "interview.json"), JSON.stringify(this.currentSession, null, 2));
  }

  private async interview(): Promise<DiscoverySessionState> {
    const session = this.getCurrentSession();
    session.isAnalyzing = true;
    session.ready = false;
    this.persist();
    try {
      const store = new ProfileStore(this.targetDir).list();
      const provider = store.selectedProviders?.interviewer ?? "local";
      const profile = store.profiles.find(p => p.role === "interviewer" && p.provider === provider && !p.disabled);
      if (!profile) throw new Error("Save an interviewer connection in Settings first.");
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (profile.apiKey && profile.apiKey !== "none") headers.authorization = `Bearer ${profile.apiKey}`;
      const system = `You are Crew Platform's thoughtful software interviewer. Ask one useful question at a time, with up to three suggested answers. Draw out tacit knowledge, accessibility needs, priorities, constraints, and what success looks like. Be gentle and practical. Offer solutions to gaps; do not interrogate or silently invent answers. Preserve user statements and mark assumptions. Do not use tools or execute work. Return ONLY JSON: {"title":"short title","reply":"conversational response and next question if needed","ready":false,"questions":[{"question":"next necessary question","choices":["choice"]}],"specMarkdown":"# Title\\n\\n## Goal\\n...\\n\\n## Requirements\\n...\\n\\n## Acceptance Criteria\\n...\\n\\n## Boundaries\\n..."}. Mark ready true only when the goal, requirements, boundaries, and concrete acceptance checks are supplied, no required questions remain, and the user has been shown a summary. A user can explicitly scope a smaller deliverable. Final approval is always the user's choice. Current draft follows:\n${session.specMarkdown}`;
      const response = await fetch(profile.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
        method: "POST", headers, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ model: profile.model, messages: [{ role: "system", content: system }, ...session.chatHistory.slice(-24).map(m => ({ role: m.role, content: m.content }))], max_tokens: 4096 }),
      });
      if (!response.ok) throw new Error(`Interviewer connection returned HTTP ${response.status}. Check Settings → Test connection.`);
      const data = await response.json() as any;
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("The interviewer returned no usable response.");
      const result = JSON.parse(text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, ""));
      if (typeof result.title !== "string" || typeof result.reply !== "string" || typeof result.specMarkdown !== "string" || !Array.isArray(result.questions)) throw new Error("The interviewer response was incomplete. Try again; your input is saved.");
      const questions = result.questions.map((q: any, i: number) => {
        if (typeof q.question !== "string" || !Array.isArray(q.choices) || !q.choices.every((c: unknown) => typeof c === "string")) throw new Error("The interviewer returned an invalid question.");
        return { id: `question-${Date.now()}-${i}`, question: q.question, choices: q.choices.slice(0, 3), answered: false };
      });
      session.title = result.title;
      session.specMarkdown = result.specMarkdown;
      session.analysis = { summary: result.reply, missingRequirements: [], ambiguities: [], suggestions: [], risks: [], openQuestions: questions };
      session.ready = result.ready === true && questions.length === 0 && ["Goal", "Requirements", "Acceptance Criteria", "Boundaries"].every(h => new RegExp(`^## ${h}\\s*\\n\\S`, "m").test(result.specMarkdown));
      session.chatHistory.push({ id: `msg-${Date.now()}`, role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
      return session;
    } catch (error) {
      throw new Error(error instanceof TypeError ? "Can't reach your LLM router. Start it, then try again. Your input is saved." : (error as Error).message);
    } finally { session.isAnalyzing = false; this.persist(); }
  }

  approveSpecification(
    fileName = "approved-spec.md",
    approvedBy = "Lead Engineer",
  ): ApprovalRecord {
    const session = this.getCurrentSession();
    const requestsDir = join(this.targetDir, "requests");

    if (!existsSync(requestsDir)) {
      mkdirSync(requestsDir, { recursive: true });
    }

    if (!/^[a-zA-Z0-9_-]+(?:\.md)?$/.test(fileName)) throw new Error("Choose a simple specification filename.");
    const safeName = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
    const targetFilePath = join(requestsDir, safeName);

    // Prepare approved document header with metadata metadata
    const now = new Date().toISOString();
    const approvedDoc = `<!-- SSSF APPROVED SPECIFICATION -->
<!-- Approved At: ${now} -->
<!-- Approved By: ${approvedBy} -->
<!-- Session ID: ${session.id} -->

${session.specMarkdown.trim()}

---
## Factory Handoff Checklist
- [x] Human engineer reviewed and approved specification
- [x] Clear acceptance criteria and boundaries defined
- [x] Ready for ADW execution (e.g. adw_simple_sdlc.py or adw_plan_build_test.py)
`;

    writeFileSync(targetFilePath, approvedDoc, "utf-8");

    const wordCount = approvedDoc.split(/\s+/).filter(Boolean).length;
    const summary = session.analysis?.summary || session.title;

    const record: ApprovalRecord = {
      id: "appr-" + Date.now().toString(36),
      timestamp: now,
      specTitle: session.title,
      savedFilePath: targetFilePath,
      approvedBy,
      wordCount,
      summary,
      content: approvedDoc,
    };

    // Save to audit history
    this.saveApprovalToHistory(record);

    session.chatHistory.push({
      id: "msg-" + Date.now(),
      role: "assistant",
      content: `🎉 **Specification Approved!**\n\n` +
        `Successfully saved to: \`${targetFilePath}\`.\n` +
        `This specification is now ready to be picked up by the factory. You can switch to the **Launch** tab to run an ADW against it!`,
      timestamp: new Date().toISOString(),
    });

    return record;
  }

  private saveApprovalToHistory(record: ApprovalRecord): void {
    try {
      const historyDir = join(this.targetDir, "adws", "adw_data");
      if (!existsSync(historyDir)) {
        mkdirSync(historyDir, { recursive: true });
      }
      const historyFile = join(historyDir, "studio_history.json");
      let history: { approvals: ApprovalRecord[]; runs: any[] } = { approvals: [], runs: [] };
      if (existsSync(historyFile)) {
        try {
          history = JSON.parse(readFileSync(historyFile, "utf-8"));
        } catch {}
      }
      if (!Array.isArray(history.approvals)) history.approvals = [];
      history.approvals.unshift(record);
      writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8");
    } catch (e) {
      console.error("[discovery] failed to write approval history:", e);
    }
  }

  getApprovalHistory(): ApprovalRecord[] {
    try {
      const historyFile = join(this.targetDir, "adws", "adw_data", "studio_history.json");
      if (existsSync(historyFile)) {
        const history = JSON.parse(readFileSync(historyFile, "utf-8"));
        return Array.isArray(history.approvals) ? history.approvals : [];
      }
    } catch {}
    return [];
  }

  // ── Heuristic Architectural Review Engine ─────────────────────────────────

  private generateStructuredReview(input: string): DiscoveryAnalysis {
    const text = input.toLowerCase();

    const missingRequirements: DiscoveryAnalysisItem[] = [];
    const ambiguities: DiscoveryAmbiguityItem[] = [];
    const suggestions: DiscoverySuggestionItem[] = [];
    const openQuestions: DiscoveryQuestionItem[] = [];
    const risks: DiscoveryRiskItem[] = [];

    // 1. Missing Requirements detection
    if (!text.includes("error") && !text.includes("exception") && !text.includes("fail")) {
      missingRequirements.push({
        id: "req-err",
        title: "Error Handling & Fallback Strategy",
        detail:
          "The description does not specify error recovery protocols, status codes, or fallback user experience when operations fail.",
        severity: "high",
      });
    }

    if (!text.includes("test") && !text.includes("quality") && !text.includes("assert") && !text.includes("mock")) {
      missingRequirements.push({
        id: "req-test",
        title: "Testing & Quality Verification Gates",
        detail:
          "No test specifications or verification criteria were outlined. SSSF requires deterministic quality blocks (tests, lint, typecheck).",
        severity: "medium",
      });
    }

    if (!text.includes("auth") && !text.includes("permission") && !text.includes("token") && !text.includes("role") && (text.includes("user") || text.includes("api") || text.includes("login"))) {
      missingRequirements.push({
        id: "req-auth",
        title: "Security & Authentication Boundaries",
        detail:
          "User interactions or APIs are described without specifying authentication credentials, session handling, or token validation.",
        severity: "high",
      });
    }

    if (!text.includes("persistence") && !text.includes("db") && !text.includes("database") && !text.includes("storage") && !text.includes("sqlite") && (text.includes("store") || text.includes("save") || text.includes("data"))) {
      missingRequirements.push({
        id: "req-db",
        title: "Data Persistence & Schema Definition",
        detail:
          "Data storage mechanics are mentioned, but target table schema, migration strategy, or file format are left unstated.",
        severity: "medium",
      });
    }

    // Default requirement if few detected
    if (missingRequirements.length < 2) {
      missingRequirements.push({
        id: "req-perf",
        title: "Performance & Resource Constraints",
        detail:
          "Specify expected throughput, latency budgets, payload limits, and memory usage guidelines.",
        severity: "low",
      });
    }

    // 2. Ambiguities detection
    if (text.includes("fast") || text.includes("quick") || text.includes("instant")) {
      ambiguities.push({
        id: "amb-speed",
        term: "Speed / Latency expectation",
        explanation:
          "'Fast' is subjective. Does this mean sub-100ms response time, asynchronous background processing, or UI responsiveness?",
        suggestions: ["Sub-50ms API response", "Async job queue", "Optimistic UI updates"],
      });
    }

    if (text.includes("simple") || text.includes("easy") || text.includes("clean")) {
      ambiguities.push({
        id: "amb-simple",
        term: "Simplicity vs Extensibility",
        explanation:
          "Does 'simple' imply minimal boilerplate, single-file architecture, or zero third-party dependencies?",
        suggestions: ["Zero extra dependencies", "Standard modular layout", "Self-contained script"],
      });
    }

    if (text.includes("realtime") || text.includes("real-time") || text.includes("live")) {
      ambiguities.push({
        id: "amb-live",
        term: "Live Streaming Protocol",
        explanation:
          "Real-time updates can be served via WebSocket, Server-Sent Events (SSE), or HTTP client polling (the SSSF pattern).",
        suggestions: ["SSSF standard 500ms polling", "Server-Sent Events (SSE)", "WebSockets"],
      });
    }

    if (ambiguities.length === 0) {
      ambiguities.push({
        id: "amb-scope",
        term: "Scope Boundary",
        explanation:
          "Clarify whether this change modifies existing modules or creates an isolated standalone extension.",
        suggestions: ["Isolated extension directory", "In-place non-breaking refactor"],
      });
    }

    // 3. Concrete Suggestions
    suggestions.push({
      id: "sug-boundary",
      title: "Enforce Factory Protected Files Boundary",
      description:
        "Ensure the planned changes strictly respect `adws/adw_modules/` and `adws/adw_sssf_config/` as protected paths so agent executions do not alter factory graders.",
      status: "pending",
      patchMarkdown:
        "### Boundary Constraints\n- All new code must reside strictly in application packages.\n- Core factory code in `adws/adw_modules/` remains untouched.",
    });

    suggestions.push({
      id: "sug-contract",
      title: "Establish Typed JSON Data Transfer Contracts",
      description:
        "Define explicit typed interfaces for all data passed between the user interface and back-end logic, following the SSSF typed envelope philosophy.",
      status: "pending",
      patchMarkdown:
        "### Data Transfer Contracts\n- All API communication must use strictly typed JSON interfaces.\n- Explicit error fields (`{ ok: boolean, error?: string }`) for all operations.",
    });

    suggestions.push({
      id: "sug-quality",
      title: "Include Automated Smoke & Verification Recipe",
      description:
        "Add a deterministic smoke test command to `justfile` or `quality.py` to confirm exit code 0 before concluding any agent run.",
      status: "pending",
      patchMarkdown:
        "### Verification Commands\n- Build verification: `bun run build` or `python -m compileall`\n- Test verification: verify exit code 0 and non-empty stdout.",
    });

    // 4. Open Questions
    openQuestions.push({
      id: "q-env",
      question: "Which environment and runtime should this feature target primarily?",
      choices: ["Universal (Windows, Linux, macOS)", "Bun + TypeScript", "Python 3.11+", "Node.js"],
      answered: false,
    });

    openQuestions.push({
      id: "q-sdlc",
      question: "Which SSSF workflow chain is expected to execute this work?",
      choices: [
        "adw_simple_sdlc (Plan → Build → Test → Review → Document, 3 commits)",
        "adw_plan_build_test (Plan → Build → Test → Commit)",
        "adw_plan_build (Plan → Build → Commit)",
        "adw_plan (Architecture and plan only)",
      ],
      answered: false,
    });

    openQuestions.push({
      id: "q-ui",
      question: "What UI style/presentation should accompany the output?",
      choices: ["Integrated calm dark workspace", "Minimalist CLI/API output", "Rich visual dashboards"],
      answered: false,
    });

    // 5. Risks
    risks.push({
      id: "r-scope",
      title: "Scope Creep during Agent Builder Phase",
      riskLevel: "medium",
      mitigation:
        "Anchor builder agent with strict acceptance criteria in this approved specification to prevent unauthorized refactoring.",
    });

    risks.push({
      id: "r-tokens",
      title: "Excessive Context Window Consumption",
      riskLevel: "low",
      mitigation:
        "Keep specification focused; planner agent uses bounded prompt engineering and subagents for broad searches.",
    });

    risks.push({
      id: "r-win",
      title: "Windows vs Unix Cross-Platform Shell Quirks",
      riskLevel: "medium",
      mitigation:
        "Always use argument lists instead of bare shell strings; specify explicit UTF-8 encoding for Python subprocesses.",
    });

    return {
      summary: `Specification intake for "${input.slice(0, 100).trim()}..."`,
      missingRequirements,
      ambiguities,
      suggestions,
      openQuestions,
      risks,
    };
  }

  private synthesizeSpecificationMarkdown(
    input: string,
    analysis: DiscoveryAnalysis,
  ): string {
    const title = input.trim().split("\n")[0]?.replace(/^[#\s*-]+/, "").slice(0, 70) || "Feature Specification";

    return `# ${title}

## 1. Overview & Business Objectives
${input.trim()}

## 2. User Stories & Acceptance Criteria
- [ ] **Core Functionality**: The requested functionality is implemented according to requirements without regressing existing features.
- [ ] **Contract Compliance**: Typed JSON interfaces are adhered to; envelopes parse cleanly without schema violations.
- [ ] **Verification**: Quality verification commands run with exit code 0 and green status.
- [ ] **Documentation**: Any new interfaces or configuration options are documented clearly.

## 3. Architecture & Technical Breakdown
- **Runtime Environment**: Cross-platform support (Windows & Unix).
- **Core Pattern**: Separation of concerns between engineer intent, deterministic code, and agent phases.
- **Data Flow**: Unidirectional data path, strictly avoiding side effects outside target directory.

## 4. Protected Boundaries
- Core ADW factory scripts (\`adws/adw_*.py\`) and modules (\`adws/adw_modules/\`) remain unchanged.
- Changes are scoped strictly to the target repository workspace.

## 5. Potential Risks & Mitigations
${analysis.risks.map((r) => `- **${r.title}** (${r.riskLevel}): ${r.mitigation}`).join("\n")}

## 6. Execution Recommendation
Recommended ADW: \`adw_simple_sdlc.py\` or \`adw_plan_build_test.py\`.
`;
  }
}
