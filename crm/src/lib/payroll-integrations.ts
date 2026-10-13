import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { decrypt, encrypt } from "@/lib/secure";

// Payroll integrations. Keys the agency pastes are encrypted at rest (connectors table) and never sent
// back to the browser. Platform-wide keys (env) are used when the agency hasn't added its own.

export type PayrollKind = "fwc" | "abr" | "employment_hero" | "xero";

export async function connectorFor(agencyId: string, kind: PayrollKind) {
  const [c] = await db.select().from(s.connectors).where(and(eq(s.connectors.agencyId, agencyId), eq(s.connectors.kind, kind)));
  return c ?? null;
}

export async function secretFor(agencyId: string, kind: PayrollKind) {
  const c = await connectorFor(agencyId, kind);
  if (c?.status === "active") {
    try {
      return { key: decrypt(c.accessToken), account: c.account, scope: c.scope, connector: c };
    } catch {
      /* fall through to platform key */
    }
  }
  const env = kind === "fwc" ? process.env.FWC_API_KEY : kind === "abr" ? process.env.ABR_GUID : undefined;
  return env ? { key: env, account: "Lodgely", scope: null, connector: null } : null;
}

export async function saveConnector(agencyId: string, kind: PayrollKind, values: { key: string; account: string | null; scope?: string | null; refreshToken?: string | null; expiresAt?: Date | null }, by: { id: string; name: string }) {
  const row = {
    agencyId,
    kind,
    status: "active",
    account: values.account,
    scope: values.scope ?? null,
    accessToken: encrypt(values.key),
    refreshToken: values.refreshToken ? encrypt(values.refreshToken) : null,
    expiresAt: values.expiresAt ?? null,
    connectedBy: by.id,
    connectedByName: by.name,
    lastError: null,
  };
  await db.insert(s.connectors).values(row).onConflictDoUpdate({ target: [s.connectors.agencyId, s.connectors.kind], set: row });
}

// ---------- Fair Work Commission: Modern Awards Pay Database API ----------

const FWC = "https://api.fwc.gov.au/api/v1";

export type AwardRate = { classification: string; parent: string | null; level: number; hourly: number | null; weekly: number | null; from: string; to: string | null };

async function fwcGet(key: string, path: string) {
  const r = await fetch(`${FWC}${path}`, { headers: { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (r.status === 401 || r.status === 403) throw new Error("Fair Work didn't accept that subscription key.");
  if (r.status === 404) throw new Error("No award with that code.");
  if (!r.ok) throw new Error(`Fair Work API error ${r.status}`);
  return r.json() as Promise<{ results: Record<string, unknown>[]; _meta?: { has_more_results?: boolean } }>;
}

export async function fwcCheckKey(key: string) {
  const r = await fwcGet(key, "/awards?limit=1");
  return Array.isArray(r.results);
}

/** Current adult minimum rates for each classification in an award (e.g. MA000002). */
export async function fwcAwardRates(key: string, code: string, on: string): Promise<{ name: string | null; rates: AwardRate[] }> {
  const id = encodeURIComponent(code.trim().toUpperCase());
  const since = `${Number(on.slice(0, 4)) - 1}-01-01`;
  const award = await fwcGet(key, `/awards/${id}`).catch(() => null);
  const rates: { results: Record<string, unknown>[] } = { results: [] };
  for (let page = 1; page <= 6; page++) {
    const r = await fwcGet(key, `/awards/${id}/pay-rates?employee_rate_type_code=AD&limit=100&page=${page}&operative_from=${since}`);
    rates.results.push(...r.results);
    if (!r._meta?.has_more_results) break;
  }
  const name = award ? String((award as unknown as Record<string, unknown>).name ?? (award.results?.[0] as Record<string, unknown> | undefined)?.name ?? "") || null : null;
  const out = new Map<string, AwardRate>();
  for (const r of rates.results) {
    const from = String(r.operative_from ?? "").slice(0, 10);
    const to = r.operative_to ? String(r.operative_to).slice(0, 10) : null;
    if (from > on || (to && to < on)) continue;
    const type = String(r.calculated_rate_type ?? r.base_rate_type ?? "").toLowerCase();
    const base = Number(r.base_rate ?? 0);
    const calc = Number(r.calculated_rate ?? 0);
    const hourly = type.includes("hour") ? calc || base : String(r.base_rate_type ?? "").toLowerCase().includes("week") ? Math.round((base / 38) * 100) / 100 : null;
    const weekly = String(r.base_rate_type ?? "").toLowerCase().includes("week") ? base : hourly ? Math.round(hourly * 38 * 100) / 100 : null;
    const classification = String(r.classification ?? "");
    const k = `${r.parent_classification_name ?? ""}|${classification}`;
    const prev = out.get(k);
    if (!prev || from > prev.from) out.set(k, { classification, parent: r.parent_classification_name ? String(r.parent_classification_name) : null, level: Number(r.classification_level ?? 0), hourly, weekly, from, to });
  }
  return { name, rates: [...out.values()].sort((a, b) => a.level - b.level || a.classification.localeCompare(b.classification)) };
}

// ---------- ABN Lookup (Australian Business Register) ----------

export type AbnDetails = { abn: string; status: string; name: string; businessNames: string[]; state: string | null; postcode: string | null; gst: boolean };

export async function abnLookup(guid: string, abn: string): Promise<AbnDetails | null> {
  const r = await fetch(`https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn.replace(/\D/g, "")}&callback=c&guid=${encodeURIComponent(guid)}`, { signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!r.ok) throw new Error(`ABN Lookup error ${r.status}`);
  const text = await r.text();
  const json = JSON.parse(text.replace(/^c\(/, "").replace(/\);?\s*$/, "")) as Record<string, unknown>;
  if (json.Message) {
    if (/guid/i.test(String(json.Message))) throw new Error("ABN Lookup didn't accept that GUID.");
    return null;
  }
  return {
    abn: String(json.Abn ?? ""),
    status: String(json.AbnStatus ?? ""),
    name: String(json.EntityName ?? ""),
    businessNames: Array.isArray(json.BusinessName) ? (json.BusinessName as string[]) : [],
    state: json.AddressState ? String(json.AddressState) : null,
    postcode: json.AddressPostcode ? String(json.AddressPostcode) : null,
    gst: Boolean(json.Gst),
  };
}

// ---------- Employment Hero Payroll (formerly KeyPay) ----------

const EH = "https://api.yourpayroll.com.au/api/v2";
const ehAuth = (key: string) => `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

export async function ehBusinesses(key: string) {
  const r = await fetch(`${EH}/business`, { headers: { Authorization: ehAuth(key), Accept: "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (r.status === 401) throw new Error("Employment Hero didn't accept that API key.");
  if (!r.ok) throw new Error(`Employment Hero error ${r.status}`);
  return ((await r.json()) as { id: number; name: string; abn?: string }[]).map((b) => ({ id: String(b.id), name: b.name, abn: b.abn ?? null }));
}

export type EhEmployee = Record<string, string | number | boolean | null>;

/** Creates or updates an employee in Employment Hero Payroll from their Lodgely record. */
export async function ehUpsertEmployee(key: string, businessId: string, employee: EhEmployee, existingId?: string) {
  const url = existingId ? `${EH}/business/${businessId}/employee/unstructured/${existingId}` : `${EH}/business/${businessId}/employee/unstructured`;
  const r = await fetch(url, { method: existingId ? "PUT" : "POST", headers: { Authorization: ehAuth(key), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(employee), signal: AbortSignal.timeout(20000) });
  const body = await r.text();
  if (!r.ok) throw new Error(`Employment Hero: ${body.slice(0, 200) || r.status}`);
  try {
    const j = JSON.parse(body) as { id?: number; employeeId?: number };
    return String(j.id ?? j.employeeId ?? existingId ?? "");
  } catch {
    return existingId ?? "";
  }
}

// ---------- Xero (accounting journals) ----------

export const xeroReady = () => Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
export const XERO_SCOPES = process.env.XERO_SCOPES ?? "openid profile email offline_access accounting.transactions accounting.settings.read";

export async function xeroToken(params: Record<string, string>) {
  const r = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Xero sign-in failed (${r.status})`);
  return (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

/** A fresh Xero access token for the agency, refreshing it when it's about to expire. */
export async function xeroAccess(agencyId: string) {
  const c = await connectorFor(agencyId, "xero");
  if (!c || c.status !== "active") throw new Error("Connect Xero first.");
  if (c.expiresAt && c.expiresAt.getTime() > Date.now() + 60_000) return { token: decrypt(c.accessToken), tenantId: c.scope ?? "" };
  const t = await xeroToken({ grant_type: "refresh_token", refresh_token: decrypt(c.refreshToken ?? "") });
  await db
    .update(s.connectors)
    .set({ accessToken: encrypt(t.access_token), refreshToken: encrypt(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) })
    .where(eq(s.connectors.id, c.id));
  return { token: t.access_token, tenantId: c.scope ?? "" };
}

/** Posts a payroll journal to Xero as a draft manual journal. Positive amounts are debits. */
export async function xeroJournal(agencyId: string, journal: { date: string; narration: string; lines: { accountCode: string; amount: number; description: string }[] }) {
  const { token, tenantId } = await xeroAccess(agencyId);
  const r = await fetch("https://api.xero.com/api.xro/2.0/ManualJournals", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "xero-tenant-id": tenantId, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ManualJournals: [{ Narration: journal.narration, Date: journal.date, Status: "DRAFT", JournalLines: journal.lines.map((l) => ({ LineAmount: l.amount, AccountCode: l.accountCode, Description: l.description })) }] }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Xero: ${body.slice(0, 240)}`);
  return (JSON.parse(body) as { ManualJournals?: { ManualJournalID: string }[] }).ManualJournals?.[0]?.ManualJournalID ?? null;
}

/** Default account codes in Xero's Australian chart of accounts. */
export const XERO_ACCOUNTS: Record<string, string> = {
  "Wages and salaries": "477",
  Superannuation: "478",
  "PAYG withholding payable": "825",
  "Superannuation payable": "826",
  "Wages payable": "804",
};
