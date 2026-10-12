import { BASE, IMMI } from "./config.js";
import { lodgelyFill } from "./fill.js";

const app = document.getElementById("app");
const signout = document.getElementById("signout");
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const state = { auth: null, cases: [], current: null, person: "main", overwrite: false };

async function api(path) {
  const res = await fetch(`${state.auth.base}${path}`, { headers: { Authorization: `Bearer ${state.auth.token}` } });
  if (res.status === 401) { await chrome.storage.local.remove(["token", "user"]); state.auth = null; render(); throw new Error("signed_out"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  return res.json();
}

function connectView() {
  signout.classList.add("hidden");
  const browser = /Edg\//.test(navigator.userAgent) ? "Microsoft Edge" : "Chrome";
  const v = el(`<div class="card stack">
    <h1>Connect to Lodgely</h1>
    <p class="muted">Sign in with your Lodgely account to fill ImmiAccount forms from your case files. You check every field and click Next yourself.</p>
    <button class="primary" id="connect">Connect</button>
    <small>Opens Lodgely in a new tab to approve.</small>
  </div>`);
  v.querySelector("#connect").onclick = () => chrome.tabs.create({ url: `${BASE}/ext/pair?ext=${chrome.runtime.id}&browser=${encodeURIComponent(browser)}` });
  app.replaceChildren(v);
}

async function casesView(q = "") {
  signout.classList.remove("hidden");
  const v = el(`<div class="stack">
    <div class="card split"><div><p><b>${esc(state.auth.user?.name ?? "Signed in")}</b></p><small>${esc(state.auth.user?.agency ?? "")}</small></div><a href="${IMMI}" target="_blank" class="muted">ImmiAccount ↗</a></div>
    <input type="search" id="q" placeholder="Search client or reference" value="${esc(q)}" />
    <div class="list" id="list"><small>Loading cases…</small></div>
  </div>`);
  app.replaceChildren(v);
  const input = v.querySelector("#q");
  let t;
  input.oninput = () => { clearTimeout(t); t = setTimeout(() => load(input.value), 250); };
  async function load(term) {
    const list = v.querySelector("#list");
    try {
      const { matters } = await api(`/api/ext/matters?q=${encodeURIComponent(term)}`);
      list.replaceChildren(...(matters.length ? matters.map((m) => {
        const b = el(`<button class="case"><span class="ref">${esc(m.reference)}</span><b>${esc(m.client)}</b><small>${esc(m.visa)} · ${esc(m.stage)}</small></button>`);
        b.onclick = () => openCase(m.id);
        return b;
      }) : [el(`<small>No open cases match.</small>`)]));
    } catch (e) { if (e.message !== "signed_out") list.replaceChildren(el(`<small class="result warn">${esc(e.message)}</small>`)); }
  }
  load(q);
}

async function openCase(id) {
  app.replaceChildren(el(`<small>Loading…</small>`));
  try { state.current = await api(`/api/ext/matters/${id}`); } catch (e) { if (e.message !== "signed_out") app.replaceChildren(el(`<small class="result warn">${esc(e.message)}</small>`)); return; }
  state.person = "main";
  caseView();
}

const people = (c) => [{ key: "main", label: `Main applicant: ${c.client.name}` }, ...c.sections.filter((s) => s.title.startsWith("Family member")).map((s) => ({ key: s.title, label: s.title })), { key: "agent", label: "Migration agent details" }];
function fieldsFor(c, person) {
  if (person === "agent") return c.sections.filter((s) => s.title === "Registered migration agent").flatMap((s) => s.fields);
  if (person !== "main") return c.sections.filter((s) => s.title === person).flatMap((s) => s.fields);
  return c.sections.filter((s) => !s.title.startsWith("Family member") && s.title !== "Registered migration agent").flatMap((s) => s.fields);
}

function caseView() {
  const c = state.current;
  const v = el(`<div class="stack">
    <button class="ghost" id="back" style="justify-self:start">← All cases</button>
    <div class="card stack">
      <div><span class="ref">${esc(c.matter.reference)}</span><h1>${esc(c.client.name)}</h1><small>${esc(c.matter.visaName)}</small></div>
      ${c.blocking ? `<p><span class="pill bad">${c.blocking} to fix before lodging</span> <a href="${state.auth.base}${c.packUrl}?tab=checks" target="_blank"><small>see list</small></a></p>` : `<p><span class="pill ok">Ready to lodge</span></p>`}
      <select id="person">${people(c).map((p) => `<option value="${esc(p.key)}" ${p.key === state.person ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select>
      <button class="primary" id="fill">Fill this page</button>
      <label class="toggle"><input type="checkbox" id="overwrite" ${state.overwrite ? "checked" : ""}/> Replace fields that already have a value</label>
      <p class="result hidden" id="result"></p>
    </div>
    <div class="card" id="fields"></div>
    <div class="card"><h2>Attach in this order</h2>${c.docs.length ? c.docs.map((d) => `<div class="doc"><span>${esc(d.file)}</span><small>${esc(d.evidence)}</small></div>`).join("") : "<small>No documents on this case.</small>"}
      <p style="margin-top:8px"><a href="${state.auth.base}${c.packUrl}?tab=documents" target="_blank"><small>Download the pack in Lodgely ↗</small></a></p></div>
  </div>`);
  v.querySelector("#back").onclick = () => casesView();
  v.querySelector("#person").onchange = (e) => { state.person = e.target.value; drawFields(); };
  v.querySelector("#overwrite").onchange = (e) => { state.overwrite = e.target.checked; };
  v.querySelector("#fill").onclick = fill;
  app.replaceChildren(v);
  drawFields();
}

function drawFields() {
  const box = document.getElementById("fields");
  const list = fieldsFor(state.current, state.person);
  box.replaceChildren(el(`<h2>Values (click to copy)</h2>`), ...list.map((f) => {
    const row = el(`<div class="row"><span class="k">${esc(f.label)}</span><button class="copy" title="Copy">${esc(f.value)}</button></div>`);
    row.querySelector(".copy").onclick = async (e) => { await navigator.clipboard.writeText(f.value); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = f.value), 900); };
    return row;
  }));
}

async function fill() {
  const out = document.getElementById("result");
  const btn = document.getElementById("fill");
  out.className = "result";
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const allowed = tab?.url && (tab.url.startsWith(IMMI) || tab.url.startsWith("http://localhost"));
  if (!allowed) { out.textContent = "Open the ImmiAccount form page in this window first."; out.className = "result warn"; return; }
  btn.disabled = true;
  try {
    const fields = fieldsFor(state.current, state.person);
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: lodgelyFill, args: [fields, state.overwrite] });
    const filled = new Set(results.flatMap((r) => r.result?.filled ?? []));
    out.textContent = filled.size ? `Filled ${filled.size} field${filled.size === 1 ? "" : "s"} (outlined in purple). Check them, then click Next in ImmiAccount.` : "Nothing on this page matched this case's fields. Try another person in the list, or copy values below.";
    out.className = `result ${filled.size ? "ok" : "warn"}`;
  } catch (e) {
    out.textContent = `Couldn't fill this page: ${e.message}`;
    out.className = "result warn";
  } finally { btn.disabled = false; }
}

function render() { state.auth?.token ? casesView() : connectView(); }

signout.onclick = async () => { await chrome.storage.local.remove(["token", "user"]); state.auth = null; render(); };
chrome.runtime.onMessage.addListener((m) => { if (m?.type === "lodgely:signed-in") boot(); });
async function boot() { const s = await chrome.storage.local.get(["token", "base", "user"]); state.auth = s.token ? { token: s.token, base: s.base || BASE, user: s.user } : null; render(); }
boot();
