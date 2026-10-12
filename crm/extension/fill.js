// Runs inside the ImmiAccount page (every frame) when the agent clicks "Fill this page".
// Finds each field by its on-screen label, fills it the way a person typing would, and outlines
// what it changed. It never clicks buttons, never submits, and skips fields already filled
// unless asked to overwrite.
export function lodgelyFill(fields, overwrite) {
  const norm = (s) => (s || "").toLowerCase().replace(/[*:?()]/g, " ").replace(/\s+/g, " ").trim();
  const shown = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
  const usable = (el) => shown(el) && !el.disabled && !el.readOnly && el.type !== "hidden";

  function labelText(el) {
    const parts = [];
    if (el.id) document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach((l) => parts.push(l.textContent));
    const wrap = el.closest("label");
    if (wrap) parts.push(wrap.textContent);
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    const by = el.getAttribute("aria-labelledby");
    if (by) by.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    if (!parts.length) {
      // Form rows usually put the label just before the control, a few levels up.
      let n = el;
      for (let i = 0; i < 4 && n; i++) {
        n = n.parentElement;
        const lab = n && [...n.querySelectorAll("label, legend, th, [class*='label'], [class*='Label']")].find((x) => !x.contains(el) && norm(x.textContent));
        if (lab) { parts.push(lab.textContent); break; }
      }
    }
    if (!parts.length && el.title) parts.push(el.title);
    return norm(parts.join(" "));
  }

  const hits = (text, f) => f.match.some((m) => { const t = norm(m); return text === t || (text.startsWith(t) && text.length - t.length <= 14); });

  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    for (const t of ["input", "change", "blur"]) el.dispatchEvent(new Event(t, { bubbles: true }));
  }
  function pickOption(sel, value) {
    const v = norm(value);
    const opts = [...sel.options];
    const o = opts.find((x) => norm(x.text) === v) ?? opts.find((x) => norm(x.text).startsWith(v)) ?? opts.find((x) => v.length > 3 && norm(x.text).includes(v));
    if (!o) return false;
    sel.value = o.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  const mark = (el) => { el.style.outline = "2px solid #7c3aed"; el.style.outlineOffset = "2px"; el.dataset.lodgely = "filled"; };

  const done = [];
  const missed = [];
  const used = new Set();
  const controls = [...document.querySelectorAll("input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), select, textarea")].filter(usable);
  const radios = [...document.querySelectorAll("input[type=radio]")].filter(usable);
  const groups = [...new Set(radios.map((r) => r.name))].map((name) => radios.filter((r) => r.name === name));

  for (const f of fields) {
    let ok = false;
    for (const el of controls) {
      if (used.has(el) || !hits(labelText(el), f)) continue;
      if (el.tagName === "SELECT") {
        if (!overwrite && el.selectedIndex > 0) { used.add(el); ok = true; break; }
        if (pickOption(el, f.value)) { mark(el); used.add(el); done.push(f.label); ok = true; break; }
        continue;
      }
      if (!overwrite && el.value) { used.add(el); ok = true; break; }
      setValue(el, f.value);
      mark(el);
      used.add(el);
      done.push(f.label);
      ok = true;
      break;
    }
    if (!ok && f.kind === "choice") {
      // Radio questions: the question text sits on an ancestor; the answer on each option's label.
      for (const g of groups) {
        // Walk up from the options until the text starts with the question, stopping before
        // reaching a box that also holds other form fields.
        let box = g[0];
        let question = "";
        for (let i = 0; i < 6 && box; i++) {
          box = box.parentElement;
          if (!box || !g.every((r) => box.contains(r))) continue;
          const others = [...box.querySelectorAll("input, select, textarea")].some((x) => !g.includes(x) && x.type !== "hidden");
          if (others) break;
          const text = norm(box.innerText);
          if (f.match.some((m) => text.startsWith(norm(m)))) { question = text; break; }
        }
        if (!question || !f.match.some((m) => question.startsWith(norm(m)))) continue;
        const want = norm(f.value);
        const r = g.find((x) => norm(labelText(x)) === want || norm(x.value) === want);
        if (r && (overwrite || !g.some((x) => x.checked))) { r.click(); mark(r.parentElement || r); done.push(f.label); }
        ok = Boolean(r);
        break;
      }
    }
    if (!ok) missed.push(f.label);
  }
  return { filled: done, notOnPage: missed, frame: location.href };
}
