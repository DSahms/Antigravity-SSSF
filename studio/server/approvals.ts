/**
 * Approval Book — server-side enforcement of "no run without approval".
 *
 * Records are stored in `<target>/.sssf/approvals.json` (gitignored). Each
 * approval has a specVersion + specHash; any spec edit after approval
 * creates a new version that requires re-approval. Approval can be
 * withdrawn before a run starts; withdrawn approvals cannot authorize a
 * run.
 *
 * The launcher (`WorkflowLauncher.launchWorkflow`) MUST call
 * `assertApproved()` before spawning the workflow. This is the rule the
 * mission prompt states must be enforced server-side, not just in the UI.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type {
  ApprovalBookSummary,
  ApprovalRecordV2,
  ApprovalSection,
} from "../shared/types.ts";

export class ApprovalBook {
  private dir: string;
  private file: string;
  private records: ApprovalRecordV2[] = [];

  constructor(targetDir: string) {
    this.dir = join(targetDir, ".sssf");
    this.file = join(this.dir, "approvals.json");
    this.load();
  }

  setTargetDir(targetDir: string) {
    this.dir = join(targetDir, ".sssf");
    this.file = join(this.dir, "approvals.json");
    this.load();
  }

  private load() {
    this.records = [];
    try {
      if (existsSync(this.file)) {
        const raw = readFileSync(this.file, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.records = parsed as ApprovalRecordV2[];
      }
    } catch (e) {
      console.error("[approval] failed to load book:", e);
      this.records = [];
    }
  }

  private persist() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.records, null, 2), "utf-8");
  }

  static hashSpec(markdown: string): string {
    return createHash("sha256").update(markdown).digest("hex").slice(0, 16);
  }

  private executionHash(): string {
    const target = dirname(this.dir);
    const hash = createHash("sha256");
    for (const relative of ["adws/adw_sssf_config/sssf.config.yaml", ".sssf/profiles.json"]) {
      const path = join(target, relative);
      hash.update(relative);
      hash.update(existsSync(path) ? readFileSync(path) : "missing");
    }
    return hash.digest("hex");
  }

  list(): ApprovalBookSummary[] {
    return this.records
      .filter((r) => !r.withdrawnAt)
      .map((r) => ({
        id: r.id,
        specTitle: r.specTitle,
        specVersion: r.specVersion,
        approvedBy: r.approvedBy,
        approvedAt: r.approvedAt,
        withdrawnAt: r.withdrawnAt,
        workflowId: r.workflowId,
        workflowName: r.workflowName,
      }));
  }

  get(id: string): ApprovalRecordV2 | null {
    return this.records.find((r) => r.id === id) ?? null;
  }

  latestForSpec(specMarkdown: string): ApprovalRecordV2 | null {
    const hash = ApprovalBook.hashSpec(specMarkdown);
    return (
      this.records
        .filter((r) => !r.withdrawnAt && r.specHash === hash)
        .sort((a, b) => b.specVersion - a.specVersion)[0] ?? null
    );
  }

  /** Find the previous version for a given spec title (to compute version). */
  private latestVersionForTitle(title: string): number {
    const matching = this.records.filter((r) => r.specTitle === title);
    if (matching.length === 0) return 0;
    return Math.max(...matching.map((r) => r.specVersion));
  }

  approve(input: {
    specMarkdown: string;
    specTitle: string;
    rawAttachment?: string;
    rawAttachmentName?: string;
    approvedBy: string;
    sections: { id: string; name: string }[];
    summary: ApprovalRecordV2["summary"];
    workflowId: string;
    workflowName: string;
    promptPreview: string;
  }): ApprovalRecordV2 {
    const hash = ApprovalBook.hashSpec(input.specMarkdown);
    const version = this.latestVersionForTitle(input.specTitle) + 1;

    const record: ApprovalRecordV2 = {
      executionHash: this.executionHash(),
      id: "appr-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      specVersion: version,
      specHash: hash,
      specMarkdown: input.specMarkdown,
      specTitle: input.specTitle,
      rawAttachment: input.rawAttachment,
      rawAttachmentName: input.rawAttachmentName,
      approvedBy: input.approvedBy,
      approvedAt: new Date().toISOString(),
      sections: input.sections.map((s) => ({
        id: s.id,
        name: s.name,
        confirmed: true,
        confirmedAt: new Date().toISOString(),
      })),
      summary: input.summary,
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      promptPreview: input.promptPreview,
    };

    this.records.unshift(record);
    this.persist();
    return record;
  }

  /** Withdraw an approval before a run starts. Returns true on success. */
  withdraw(id: string): boolean {
    const r = this.get(id);
    if (!r || r.withdrawnAt) return false;
    r.withdrawnAt = new Date().toISOString();
    this.persist();
    return true;
  }

  /** Toggle a single section's confirmation (used during the multi-step review). */
  setSection(id: string, sectionId: string, confirmed: boolean): ApprovalRecordV2 | null {
    const r = this.get(id);
    if (!r) return null;
    const s = r.sections.find((x) => x.id === sectionId);
    if (!s) return r;
    s.confirmed = confirmed;
    s.confirmedAt = confirmed ? new Date().toISOString() : undefined;
    this.persist();
    return r;
  }

  /**
   * The hard gate. Called by the launcher before spawning a workflow.
   * Throws if the approval is missing, withdrawn, or doesn't match the
   * workflowId the run was started with.
   */
  assertApproved(approvalId: string, workflowId: string): ApprovalRecordV2 {
    const r = this.get(approvalId);
    if (!r) {
      throw new Error("No approval recorded for this run. Approve the spec first.");
    }
    if (r.withdrawnAt) {
      throw new Error("Approval was withdrawn before the run started. Re-approve to run.");
    }
    if (r.workflowId !== workflowId) {
      throw new Error(
        `Approval authorizes workflow "${r.workflowName}", not "${workflowId}". Re-approve for this workflow.`,
      );
    }
    if (r.executionHash !== this.executionHash()) throw new Error("Connection or roster settings changed after approval. Review and approve the job again.");
    // All sections must be confirmed.
    const unconfirmed = r.sections.filter((s) => !s.confirmed);
    if (unconfirmed.length > 0) {
      throw new Error(
        `Cannot start run: ${unconfirmed.length} section(s) not confirmed: ${unconfirmed.map((s) => s.name).join(", ")}`,
      );
    }
    return r;
  }
}
