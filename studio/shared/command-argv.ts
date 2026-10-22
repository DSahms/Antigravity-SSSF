/** Parse a saved check without shell expansion or consuming Windows backslashes. */
export function parseArgv(input: string): string[] {
  const text = input.trim();
  if (text.startsWith("[")) {
    const value = JSON.parse(text);
    if (!Array.isArray(value) || !value.length || !value.every(v => typeof v === "string" && v.length)) throw new Error("Use a non-empty list of command arguments.");
    return value;
  }
  const out: string[] = [];
  let current = "", quote = "", started = false;
  for (const ch of text) {
    if (quote) { if (ch === quote) quote = ""; else current += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) { if (started) { out.push(current); current = ""; started = false; } continue; }
    current += ch; started = true;
  }
  if (quote) throw new Error("Close the quote in that command before saving.");
  if (started) out.push(current);
  return out;
}
