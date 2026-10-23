// Test I — Windows Voice Typing compatibility (accessibility).
// The OS voice-typing launcher (Win+H) works with standard editable fields
// that can take focus and show a caret. This test proves every CREW intake
// control is a native textarea/input, clickable with no overlay intercepting,
// takes a visible caret, and accepts IME-style committed text
// (keyboard.insertText — no key events, exactly how voice typing commits),
// which then stays editable. No-model controls always run; interview controls
// need the router and skip with a reason otherwise. Port 4640.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { Page } from "playwright";
import {
  acceptanceEnabled,
  modelReady,
  launchPackaged,
  closeLaunched,
  dumpFailure,
  screenshot,
  goScreen,
  answerUntilReady,
  analyzeWithRetry,
  MINI_TODO_TEXT,
  type Launched,
} from "./helpers";

const run = acceptanceEnabled() ? describe : describe.skip;
const runModel = acceptanceEnabled() && modelReady() ? describe : describe.skip;

async function expectVoiceReady(page: Page, locator: string, name: string): Promise<void> {
  const el = page.locator(locator).first();
  await el.scrollIntoViewIfNeeded();
  await el.click({ timeout: 30_000 });
  // The click must land on the control itself — no overlay, bubble, dim
  // layer, or disabled shim may intercept it.
  const box = await el.boundingBox();
  expect(box, `${name} has no on-screen box`).not.toBeNull();
  const topmost = await page.evaluate(
    ({ x, y }) => {
      const t = document.elementFromPoint(x, y);
      if (!t) return "none";
      const tag = t.tagName.toLowerCase();
      const id = (t as HTMLElement).id ? `#${(t as HTMLElement).id}` : "";
      const cls = typeof (t as HTMLElement).className === "string" ? `.${(t as HTMLElement).className.split(" ")[0]}` : "";
      return `${tag}${id}${cls}`;
    },
    { x: box!.x + Math.min(24, box!.width / 2), y: box!.y + box!.height / 2 },
  );
  expect(topmost, `${name} is covered by ${topmost}`).toMatch(/^(textarea|input)/);
  // Focus + caret: the OS launcher keys off these.
  const tag = await el.evaluate((n) => {
    if (!(n instanceof HTMLElement)) return "not-element";
    n.focus();
    const active = document.activeElement === n;
    const sel = (n as HTMLTextAreaElement).selectionStart;
    return `${n.tagName.toLowerCase()}:active=${active}:caret=${typeof sel === "number" ? sel : "none"}`;
  });
  expect(tag, `${name} is not a focusable native field`).toMatch(/^(textarea|input):active=true:caret=\d+$/);
}

async function expectDictation(page: Page, locator: string, marker: string, clear = true): Promise<void> {
  const el = page.locator(locator).first();
  await el.click({ timeout: 30_000 });
  // IME-style commit: no key events, exactly like voice-typing insertion.
  await page.keyboard.insertText(marker);
  await page.waitForFunction(
    (m) => (document.activeElement as HTMLTextAreaElement)?.value?.includes(m),
    marker,
    { timeout: 15_000 },
  );
  // Dictated text stays editable: append typed text, then select-all+replace.
  await page.keyboard.press("End");
  await page.keyboard.type(" + typed");
  let value = await el.inputValue();
  expect(value).toContain(marker);
  expect(value).toContain("+ typed");
  if (!clear) return;
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("replacement");
  value = await el.inputValue();
  expect(value).toBe("replacement");
  await el.fill("");
}

run("acceptance I — Windows voice-typing compatibility (no model needed)", () => {
  let l: Launched;
  const name = "i-voice";

  beforeAll(async () => {
    l = await launchPackaged(4640);
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("talk textarea is a native focusable field (tour showing)", async () => {
    await goScreen(l.page, /new job/i);
    // NOTE: no dismissTour — first-run state is what David hit.
    await expectVoiceReady(l.page, "textarea", "talk textarea");
  }, 120_000);

  it("talk textarea accepts dictated text and it stays editable", async () => {
    await expectDictation(l.page, "textarea", `voice probe ${Date.now().toString(36)}`);
    await screenshot(l.page, "i-dictation");
  }, 120_000);

  it("paste textarea is a native focusable field", async () => {
    await goScreen(l.page, /new job/i);
    await l.page.getByRole("tab", { name: /paste/i }).first().click();
    await expectVoiceReady(l.page, "textarea", "paste textarea");
    await expectDictation(l.page, "textarea", `paste voice ${Date.now().toString(36)}`);
  }, 120_000);
});

runModel("acceptance I — voice typing inside the interview (needs router)", () => {
  let l: Launched;
  const name = "i-voice-interview";

  beforeAll(async () => {
    l = await launchPackaged(4641);
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("question, chat, and spec fields accept dictated text", async () => {
    await goScreen(l.page, /new job/i);
    await l.page.locator("textarea").first().fill(MINI_TODO_TEXT);
    await analyzeWithRetry(l.page);
    // Free-text question box: dictate the answer, then submit it with Enter.
    const q = l.page.locator(".q-card:not(.answered) .q-choices input").first();
    if ((await q.count()) > 0) {
      await expectVoiceReady(l.page, ".q-card:not(.answered) .q-choices input", "question input");
      await expectDictation(l.page, ".q-card:not(.answered) .q-choices input", `answer ${Date.now().toString(36)}`, false);
      await l.page.keyboard.press("Enter");
    }
    // Chat follow-up composer.
    const chat = l.page.locator("#interview-followup");
    if ((await chat.count()) > 0) {
      await expectVoiceReady(l.page, "#interview-followup", "chat composer");
      await expectDictation(l.page, "#interview-followup", `chat ${Date.now().toString(36)}`);
    }
    // Working-spec editor.
    const spec = l.page.locator("textarea.spec-edit");
    if ((await spec.count()) > 0) {
      await expectVoiceReady(l.page, "textarea.spec-edit", "spec editor");
    }
    // Reach ready so the flow can continue to review.
    expect(await answerUntilReady(l.page, 25)).toBe(true);
    await screenshot(l.page, "i-interview-ready");
  }, 1_500_000);
});
