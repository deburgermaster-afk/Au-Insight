import "server-only";

// Card payment providers an agency can connect. Each creates a hosted checkout for an invoice and
// later confirms (server-to-server) whether it was paid, so nothing depends on the browser alone.
// Live vs test is detected from the credentials. Amounts are AUD.

export type ProviderKey = "stripe" | "square" | "paypal" | "airwallex" | "zeller";
export type Secrets = Record<string, string>;
export type Connected = { account: string; mode: "live" | "test"; settings: Record<string, string> };
export type Checkout = { amount: number; title: string; reference: string; email: string | null; returnUrl: string; cancelUrl: string; attemptId: string };

export const PROVIDERS: Record<ProviderKey, { name: string; blurb: string; fields: { key: string; label: string; placeholder: string; secret?: boolean }[]; help: string; fee: string; auto: boolean }> = {
  stripe: {
    name: "Stripe",
    blurb: "Cards, Apple Pay and Google Pay on Stripe's checkout page.",
    fields: [{ key: "secretKey", label: "Secret or restricted key", placeholder: "sk_live_… or rk_live_…", secret: true }],
    help: "Stripe Dashboard → Developers → API keys. A restricted key needs Checkout Sessions (write) and Account (read).",
    fee: "Stripe's standard card fees",
    auto: true,
  },
  square: {
    name: "Square",
    blurb: "Square's online checkout, paid into your Square account.",
    fields: [{ key: "accessToken", label: "Access token", placeholder: "EAAA…", secret: true }],
    help: "Square Developer Console → your app → Credentials → Production access token.",
    fee: "Square's online card fees",
    auto: true,
  },
  paypal: {
    name: "PayPal",
    blurb: "PayPal balance or card via PayPal checkout.",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "A…" },
      { key: "secret", label: "Secret", placeholder: "E…", secret: true },
    ],
    help: "developer.paypal.com → Apps & Credentials → your app (Live).",
    fee: "PayPal's merchant fees",
    auto: true,
  },
  airwallex: {
    name: "Airwallex",
    blurb: "Airwallex payment link: cards and local payment methods.",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "…" },
      { key: "apiKey", label: "API key", placeholder: "…", secret: true },
    ],
    help: "Airwallex web app → Settings → Developer → API keys.",
    fee: "Airwallex's card fees",
    auto: true,
  },
  zeller: {
    name: "Zeller",
    blurb: "Your Zeller Pay by Link. Staff add a link to an invoice; the client pays and uploads the receipt.",
    fields: [],
    help: "Create the payment link in the Zeller app or dashboard (Virtual Terminal → Payment Link), then paste it on the invoice in Lodgely.",
    fee: "Zeller's Pay by Link fees",
    auto: false,
  },
};

const cents = (n: number) => Math.round(n * 100);
const fail = async (r: Response, who: string) => {
  const body = await r.text();
  let msg = body.slice(0, 200);
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string; errors?: { detail?: string }[]; error_description?: string };
    msg = (typeof j.error === "object" ? j.error?.message : undefined) ?? j.message ?? j.errors?.[0]?.detail ?? j.error_description ?? (typeof j.error === "string" ? j.error : msg);
  } catch {}
  return new Error(`${who}: ${msg}`);
};

// ── Stripe ───────────────────────────────────────────────────────────────────────────────────
const stripe = (key: string, path: string, body?: URLSearchParams) =>
  fetch(`https://api.stripe.com/v1${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body });

// ── Square ───────────────────────────────────────────────────────────────────────────────────
const SQUARE = { live: "https://connect.squareup.com", test: "https://connect.squareupsandbox.com" };
const square = (env: "live" | "test", token: string, path: string, body?: unknown) =>
  fetch(`${SQUARE[env]}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Square-Version": "2024-07-17", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

// ── PayPal ───────────────────────────────────────────────────────────────────────────────────
const PAYPAL = { live: "https://api-m.paypal.com", test: "https://api-m.sandbox.paypal.com" };
async function paypalToken(env: "live" | "test", s: Secrets) {
  const r = await fetch(`${PAYPAL[env]}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${s.clientId}:${s.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!r.ok) throw await fail(r, "PayPal");
  return ((await r.json()) as { access_token: string }).access_token;
}

// ── Airwallex ────────────────────────────────────────────────────────────────────────────────
const AIRWALLEX = { live: "https://api.airwallex.com", test: "https://api-demo.airwallex.com" };
async function airwallexToken(env: "live" | "test", s: Secrets) {
  const r = await fetch(`${AIRWALLEX[env]}/api/v1/authentication/login`, { method: "POST", headers: { "x-client-id": s.clientId, "x-api-key": s.apiKey, "Content-Type": "application/json" } });
  if (!r.ok) throw await fail(r, "Airwallex");
  return ((await r.json()) as { token: string }).token;
}

/** Checks the credentials, works out live/test, and returns a label for the account. */
export async function connectProvider(p: ProviderKey, s: Secrets): Promise<Connected> {
  if (p === "zeller") return { account: "Zeller Pay by Link", mode: "live", settings: {} };
  if (p === "stripe") {
    const key = s.secretKey?.trim();
    if (!/^(sk|rk)_(live|test)_/.test(key ?? "")) throw new Error("That doesn't look like a Stripe secret key (sk_live_… or rk_live_…). Publishable keys (pk_) won't work.");
    const r = await stripe(key, "/account");
    if (!r.ok) throw await fail(r, "Stripe");
    const a = (await r.json()) as { id: string; settings?: { dashboard?: { display_name?: string } }; business_profile?: { name?: string }; default_currency?: string };
    return { account: a.settings?.dashboard?.display_name ?? a.business_profile?.name ?? a.id, mode: key.includes("_test_") ? "test" : "live", settings: { accountId: a.id } };
  }
  if (p === "square") {
    for (const env of ["live", "test"] as const) {
      const r = await square(env, s.accessToken.trim(), "/v2/locations");
      if (r.status === 401) continue;
      if (!r.ok) throw await fail(r, "Square");
      const { locations = [] } = (await r.json()) as { locations?: { id: string; name: string; status: string; currency: string; business_name?: string }[] };
      const loc = locations.find((l) => l.status === "ACTIVE" && l.currency === "AUD") ?? locations.find((l) => l.status === "ACTIVE");
      if (!loc) throw new Error("Square: no active location found on this account.");
      return { account: `${loc.business_name ?? loc.name} (${loc.name})`, mode: env, settings: { locationId: loc.id, currency: loc.currency } };
    }
    throw new Error("Square: that access token wasn't accepted.");
  }
  if (p === "paypal") {
    for (const env of ["live", "test"] as const) {
      try {
        await paypalToken(env, s);
        return { account: `PayPal app …${s.clientId.slice(-6)}`, mode: env, settings: {} };
      } catch {}
    }
    throw new Error("PayPal: that client ID and secret weren't accepted.");
  }
  for (const env of ["live", "test"] as const) {
    try {
      await airwallexToken(env, s);
      return { account: `Airwallex …${s.clientId.slice(-6)}`, mode: env, settings: {} };
    } catch {}
  }
  throw new Error("Airwallex: that client ID and API key weren't accepted.");
}

/** Creates the hosted checkout; returns its id and the URL to send the client to. */
export async function createCheckout(p: ProviderKey, mode: "live" | "test", s: Secrets, settings: Record<string, string>, c: Checkout): Promise<{ externalId: string; url: string }> {
  if (p === "stripe") {
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "aud",
      "line_items[0][price_data][unit_amount]": String(cents(c.amount)),
      "line_items[0][price_data][product_data][name]": c.title,
      success_url: `${c.returnUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: c.cancelUrl,
      client_reference_id: c.attemptId,
      "metadata[attempt]": c.attemptId,
      "metadata[reference]": c.reference,
      "payment_intent_data[description]": c.title,
    });
    if (c.email) body.set("customer_email", c.email);
    const r = await stripe(s.secretKey, "/checkout/sessions", body);
    if (!r.ok) throw await fail(r, "Stripe");
    const j = (await r.json()) as { id: string; url: string };
    return { externalId: j.id, url: j.url };
  }
  if (p === "square") {
    const r = await square(mode, s.accessToken, "/v2/online-checkout/payment-links", {
      idempotency_key: c.attemptId,
      quick_pay: { name: c.title, price_money: { amount: cents(c.amount), currency: settings.currency ?? "AUD" }, location_id: settings.locationId },
      checkout_options: { redirect_url: c.returnUrl },
      payment_note: c.reference,
      ...(c.email ? { pre_populated_data: { buyer_email: c.email } } : {}),
    });
    if (!r.ok) throw await fail(r, "Square");
    const j = (await r.json()) as { payment_link: { id: string; url: string; order_id: string } };
    return { externalId: j.payment_link.order_id, url: j.payment_link.url };
  }
  if (p === "paypal") {
    const token = await paypalToken(mode, s);
    const r = await fetch(`${PAYPAL[mode]}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": c.attemptId },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: c.attemptId, invoice_id: `${c.reference}-${c.attemptId.slice(0, 8)}`, description: c.title.slice(0, 127), amount: { currency_code: "AUD", value: c.amount.toFixed(2) } }],
        application_context: { return_url: c.returnUrl, cancel_url: c.cancelUrl, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" },
      }),
    });
    if (!r.ok) throw await fail(r, "PayPal");
    const j = (await r.json()) as { id: string; links: { rel: string; href: string }[] };
    const url = j.links.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
    if (!url) throw new Error("PayPal didn't return a checkout link.");
    return { externalId: j.id, url };
  }
  if (p === "airwallex") {
    const token = await airwallexToken(mode, s);
    const r = await fetch(`${AIRWALLEX[mode]}/api/v1/pa/payment_links/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: c.title.slice(0, 100), reusable: false, amount: Number(c.amount.toFixed(2)), currency: "AUD", reference: c.reference, description: c.title, metadata: { attempt: c.attemptId } }),
    });
    if (!r.ok) throw await fail(r, "Airwallex");
    const j = (await r.json()) as { id: string; url: string };
    return { externalId: j.id, url: j.url };
  }
  throw new Error("Zeller payments use the link on the invoice.");
}

/** Asks the provider whether the checkout was paid (and captures it where that's a separate step). */
export async function confirmCheckout(p: ProviderKey, mode: "live" | "test", s: Secrets, externalId: string): Promise<{ paid: boolean; amount?: number; reference?: string }> {
  if (p === "stripe") {
    const r = await stripe(s.secretKey, `/checkout/sessions/${externalId}`);
    if (!r.ok) throw await fail(r, "Stripe");
    const j = (await r.json()) as { payment_status: string; amount_total: number; payment_intent: string | null };
    return { paid: j.payment_status === "paid", amount: j.amount_total / 100, reference: j.payment_intent ?? externalId };
  }
  if (p === "square") {
    const r = await square(mode, s.accessToken, `/v2/orders/${externalId}`);
    if (!r.ok) throw await fail(r, "Square");
    const { order } = (await r.json()) as { order: { state: string; tenders?: { id: string; amount_money: { amount: number } }[]; net_amount_due_money?: { amount: number } } };
    const paidCents = (order.tenders ?? []).reduce((t, x) => t + x.amount_money.amount, 0);
    return { paid: paidCents > 0 && (order.net_amount_due_money?.amount ?? 0) === 0, amount: paidCents / 100, reference: order.tenders?.[0]?.id ?? externalId };
  }
  if (p === "paypal") {
    const token = await paypalToken(mode, s);
    const get = await fetch(`${PAYPAL[mode]}/v2/checkout/orders/${externalId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!get.ok) throw await fail(get, "PayPal");
    let order = (await get.json()) as { status: string; purchase_units?: { payments?: { captures?: { id: string; amount: { value: string }; status: string }[] } }[] };
    if (order.status === "APPROVED") {
      const cap = await fetch(`${PAYPAL[mode]}/v2/checkout/orders/${externalId}/capture`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `capture-${externalId}` } });
      if (!cap.ok) throw await fail(cap, "PayPal");
      order = await cap.json();
    }
    const capture = order.purchase_units?.[0]?.payments?.captures?.find((c) => c.status === "COMPLETED");
    return { paid: order.status === "COMPLETED" && Boolean(capture), amount: capture ? Number(capture.amount.value) : undefined, reference: capture?.id ?? externalId };
  }
  if (p === "airwallex") {
    const token = await airwallexToken(mode, s);
    const r = await fetch(`${AIRWALLEX[mode]}/api/v1/pa/payment_links/${externalId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw await fail(r, "Airwallex");
    const j = (await r.json()) as { status: string; amount?: number; latest_successful_payment_intent_id?: string };
    return { paid: j.status === "PAID", amount: j.amount, reference: j.latest_successful_payment_intent_id ?? externalId };
  }
  return { paid: false };
}
