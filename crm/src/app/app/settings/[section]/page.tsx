import { ArrowRight, AtSign, Bell, Inbox, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Guard } from "@/components/app/guard";
import { CompareTable, PlanCards } from "@/components/app/plans";
import { PageSkeleton } from "@/components/app/skeletons";
import { AiMailCard } from "@/components/mail-ai/controls";
import { DomainCard } from "@/components/mail/domain-card";
import { AgencyForm } from "@/components/settings/agency-form";
import { AppearancePicker, ThemeValue } from "@/components/settings/appearance";
import { Configure } from "@/components/settings/configure";
import { Pill, Summary } from "@/components/settings/summary";
import { PracticeRules } from "@/components/settings/practice-rules";
import { PaymentSettings } from "@/components/settings/payments";
import { PROVIDERS } from "@/lib/payments/providers";
import { AgreementTerms } from "@/components/settings/agreement-terms";
import { DEFAULT_TERMS, parseTerms } from "@/lib/agreement";
import { ConnectToasts } from "@/components/settings/connect-toasts";
import { Connectors } from "@/components/settings/connectors";
import { Mark } from "@/components/settings/marks";
import { RefreshUsage } from "@/components/settings/refresh-usage";
import { SettingsShell } from "@/components/settings/shell";
import { UsageBars } from "@/components/settings/usage-meter";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSettings } from "@/lib/data";
import { dmy } from "@/lib/format";
import { llmEnabled } from "@/lib/llm";
import { providerReady } from "@/lib/mail-connect";
import { FREE_TIER, usageFor } from "@/lib/mail-usage";
import { canAtLeast, getCtx } from "@/lib/session";
import { sectionBySlug, tabOf } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };

const host = (v?: string | null) => (v ? v.toLowerCase().replace(/^.*@/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || null : null);

function Panel({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card", className)}>
      <header className="flex min-h-11 items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

async function Section({ params, searchParams }: PageProps<"/app/settings/[section]">) {
  await connection();
  const [{ section: slug }, sp] = await Promise.all([params, searchParams]);
  const section = sectionBySlug(slug);
  if (!section) notFound();
  const tab = tabOf(section, sp.tab);
  const [ctx, st] = await Promise.all([getCtx(), getSettings()]);
  const p = st.profile;
  const admin = canAtLeast(ctx.role, "admin");
  const sharedDomain = process.env.MAIL_FROM_DOMAIN ?? null;
  let body: ReactNode = null;
  let actions: ReactNode = null;

  if (slug === "agency") {
    const v = (x: string | null | undefined) => x || "Not set";
    const miss = (x: string | null | undefined) => !x;
    const edit = (title: string, which: string, label = "Edit") =>
      admin ? (
        <Configure title={title} label={label} size="lg">
          <AgencyForm profile={p} tab={which} canEdit />
        </Configure>
      ) : null;
    if (tab === "agreement") {
      const sections = parseTerms(p?.agreementTerms || DEFAULT_TERMS, { agency: "", client: "", visa: "" });
      body = (
        <Summary
          className="max-w-4xl"
          title="Service agreement terms"
          status={<Pill tone={p?.agreementTerms ? "info" : "muted"}>{p?.agreementTerms ? "Your own wording" : "Lodgely template"}</Pill>}
          description="The wording clients read and sign in the portal. Parties, the agent's MARN and the fee estimate are added from each matter."
          action={
            admin ? (
              <Configure title="Agreement terms" description="Start a heading with ##. {agency}, {client} and {visa} are filled in. Changes apply to agreements sent from now on." label="Edit terms" size="xl">
                <AgreementTerms value={p?.agreementTerms ?? DEFAULT_TERMS} template={DEFAULT_TERMS} custom={Boolean(p?.agreementTerms)} canEdit={admin} />
              </Configure>
            ) : null
          }
        >
          <ol className="grid gap-1.5 text-[13px] sm:grid-cols-2">
            {sections.map((sec, i) => (
              <li key={sec.heading} className="flex gap-2">
                <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="truncate">{sec.heading}</span>
              </li>
            ))}
          </ol>
        </Summary>
      );
    } else if (tab === "practice")
      body = (
        <Summary
          className="max-w-4xl"
          title="Sign-off before lodging"
          status={<Pill tone={(p?.requireSignoff ?? true) ? "ok" : "muted"}>{(p?.requireSignoff ?? true) ? "Required" : "Optional"}</Pill>}
          description={(p?.requireSignoff ?? true) ? "A second registered agent approves the lodgement pack before a matter can be marked Lodged." : "Agents can lodge without a second agent's approval. Sign-off can still be requested."}
          action={
            ctx.role === "owner" ? (
              <Configure title="Practice rules" label="Change">
                <PracticeRules requireSignoff={p?.requireSignoff ?? true} isOwner />
              </Configure>
            ) : null
          }
        />
      );
    else if (tab === "invoicing")
      body = (
        <div className="grid max-w-4xl gap-4">
          <Summary
            title="Invoicing"
            rows={[
              { label: "Invoice numbers", value: `${p?.invoicePrefix ?? "INV"}-${p?.nextInvoiceNumber ?? 1001} next` },
              { label: "GST", value: (p?.gstRegistered ?? true) ? "Registered: 10% added to professional fees" : "Not registered" },
            ]}
            action={edit("Invoicing & trust account", "invoicing")}
          />
          <Summary
            title="Client trust account"
            status={p?.bankBsb && p?.bankAccount ? <Pill tone="ok">Set</Pill> : <Pill tone="warn">Missing</Pill>}
            description="Shown on invoices and in the portal for bank transfers, with the invoice number as reference."
            rows={[
              { label: "Bank", value: v(p?.bankName), missing: miss(p?.bankName) },
              { label: "Account name", value: v(p?.bankAccountName), missing: miss(p?.bankAccountName) },
              { label: "BSB", value: v(p?.bankBsb), missing: miss(p?.bankBsb) },
              { label: "Account number", value: p?.bankAccount ? `•••• ${p.bankAccount.replace(/\s/g, "").slice(-3)}` : "Not set", missing: miss(p?.bankAccount) },
            ]}
            action={edit("Invoicing & trust account", "invoicing")}
          />
        </div>
      );
    else
      body = (
        <Summary
          className="max-w-4xl"
          title="Agency details"
          description="On invoices, agreements, the client portal and emails."
          rows={[
            { label: "Legal name", value: v(p?.legalName), missing: miss(p?.legalName) },
            { label: "ABN", value: v(p?.abn), missing: miss(p?.abn) },
            { label: "Principal's MARN", value: v(p?.marn), missing: miss(p?.marn) },
            { label: "Phone", value: v(p?.phone), missing: miss(p?.phone) },
            { label: "Email", value: v(p?.email), missing: miss(p?.email) },
            { label: "Website", value: v(p?.website), missing: miss(p?.website) },
            { label: "Address", value: v([p?.address, p?.state].filter(Boolean).join(", ")), missing: miss(p?.address) },
          ]}
          action={edit("Agency details", "details")}
        />
      );
  }

  if (slug === "appearance")
    body = (
      <Summary
        className="max-w-4xl"
        title="Theme"
        description="Just for you, on this device."
        rows={[{ label: "Appearance", value: <ThemeValue /> }]}
        action={
          <Configure title="Appearance" label="Change" size="lg">
            <AppearancePicker />
          </Configure>
        }
      />
    );

  if (slug === "payments") {
    const conns = await db.select({ provider: s.paymentProviders.provider, enabled: s.paymentProviders.enabled, status: s.paymentProviders.status, mode: s.paymentProviders.mode, account: s.paymentProviders.account, lastError: s.paymentProviders.lastError }).from(s.paymentProviders).where(eq(s.paymentProviders.agencyId, ctx.agencyId));
    const bankOn = p?.bankTransferEnabled ?? true;
    const bankReady = Boolean(p?.bankBsb && p?.bankAccount);
    const offered = conns.filter((c) => c.enabled && c.status === "active").length + (bankOn ? 1 : 0);
    body = (
      <Summary
        className="max-w-4xl"
        title="How clients can pay"
        status={<Pill tone={offered ? "ok" : "warn"}>{offered ? `${offered} method${offered === 1 ? "" : "s"} on` : "None on"}</Pill>}
        description="Clients choose from these when they pay an invoice in the portal."
        rows={[
          ...Object.entries(PROVIDERS).map(([key, d]) => {
            const c = conns.find((x) => x.provider === key);
            return { label: d.name, value: c ? (c.status !== "active" ? "Needs attention" : c.enabled ? `On${c.mode === "test" ? " (test mode)" : ""}${c.account ? ` · ${c.account}` : ""}` : "Connected, switched off") : "Not connected" };
          }),
          { label: "Bank transfer", value: bankOn ? (bankReady ? "On · client uploads a screenshot" : "On, but trust account details are missing") : "Off", missing: bankOn && !bankReady },
          { label: "Payments recorded to", value: (p?.paymentsAccount ?? "trust") === "office" ? "Office account" : "Trust account" },
        ]}
        action={
          admin ? (
            <Configure title="Payments" description="Connect card providers, switch methods on or off, and choose where payments are recorded." size="xl">
              <PaymentSettings defs={Object.entries(PROVIDERS).map(([key, d]) => ({ key, ...d }))} conns={conns} bankOn={bankOn} account={p?.paymentsAccount ?? "trust"} bankReady={bankReady} canEdit={admin} />
            </Configure>
          ) : null
        }
      />
    );
  }

  if (slug === "ai") {
    body =
      tab === "pathways" ? (
        <Summary
          className="max-w-4xl"
          title="Suggested pathways"
          status={<Pill tone={llmEnabled() ? "ok" : "muted"}>{llmEnabled() ? "AI on" : "Rules only"}</Pill>}
          description="On each student's file: routes to permanent residence, from what worked for similar students at your agency, otherwise the fastest pathway from their current visa and course."
          rows={[
            { label: "Suggestions come from", value: llmEnabled() ? "Lodgely AI, checked against built-in rules" : "Lodgely's built-in rules" },
            { label: "Who sees them", value: "Everyone with access to clients" },
            { label: "Status", value: "Decision support only: a registered agent checks current visa settings before advising" },
          ]}
        />
      ) : (
        <div className="grid max-w-3xl gap-4">
          <AiMailCard on={Boolean(p?.aiMailEnabledAt)} by={p?.aiMailEnabledBy ?? null} at={p?.aiMailEnabledAt ? dmy(p.aiMailEnabledAt) : null} available={llmEnabled()} />
          <p className="text-[12px] text-muted-foreground">Per-case tracking is switched on from each matter’s header once the assistant is on here.</p>
        </div>
      );
  }

  if (slug === "connectors") {
    const usage = await usageFor(ctx.agencyId);
    body = (
      <Connectors
        tab={tab}
        resend={st.resend}
        usage={{ source: usage.source, plan: usage.plan, usage: usage.usage }}
        mine={st.connections.filter((c) => c.userId === ctx.userId)}
        ready={{ google: providerReady("google"), microsoft: providerReady("microsoft") }}
        domain={p?.mailDomain ? { name: p.mailDomain, status: p.mailDomainStatus } : null}
        ai={{ on: Boolean(p?.aiMailEnabledAt), available: llmEnabled() }}
        canAdmin={admin}
        extensions={await db
          .select({ id: s.extensionTokens.id, label: s.extensionTokens.label, createdAt: s.extensionTokens.createdAt, lastUsedAt: s.extensionTokens.lastUsedAt })
          .from(s.extensionTokens)
          .where(and(eq(s.extensionTokens.agencyId, ctx.agencyId), eq(s.extensionTokens.userId, ctx.userId), isNull(s.extensionTokens.revokedAt)))
          .orderBy(desc(s.extensionTokens.createdAt))}
        initial={typeof sp.open === "string" ? sp.open : undefined}
      />
    );
  }

  if (slug === "email") {
    const usage = await usageFor(ctx.agencyId);
    const own = p?.mailDomainStatus === "verified" ? p.mailDomain : null;
    const via = usage.source === "resend" ? `your Resend account${usage.account ? ` (${usage.account})` : ""}` : "Lodgely's shared sending";
    if (tab === "domain") {
      const records = p?.mailDomainRecords ?? [];
      const ok = records.filter((r) => r.status === "verified").length;
      const verified = p?.mailDomainStatus === "verified";
      body = (
        <Summary
          className="max-w-4xl"
          title="Email domain"
          status={p?.mailDomain ? <Pill tone={verified ? "ok" : "warn"}>{(p.mailDomainStatus ?? "pending").replace(/_/g, " ")}</Pill> : <Pill>Not set up</Pill>}
          description={verified ? `The team sends and receives as name@${p?.mailDomain}.` : p?.mailDomain ? "Waiting for the DNS records. Lodgely keeps checking." : `Mail uses the shared ${sharedDomain ?? "Lodgely"} domain until you add yours.`}
          rows={[
            { label: "Domain", value: p?.mailDomain ?? "None", missing: !p?.mailDomain },
            { label: "Sending account", value: p?.mailDomainVia === "resend" ? "Your Resend account" : p?.mailDomain ? "Lodgely" : "—" },
            { label: "DNS records", value: records.length ? `${ok} of ${records.length} verified` : "—", missing: records.length > 0 && ok < records.length },
            { label: "Last checked", value: p?.mailDomainCheckedAt ? dmy(p.mailDomainCheckedAt) : "—" },
          ]}
          action={
            admin ? (
              <Configure title="Email domain" label={p?.mailDomain ? "Manage domain" : "Set up domain"} size="xl">
                <DomainCard
                  domain={p?.mailDomain ?? null}
                  status={p?.mailDomainStatus ?? null}
                  records={p?.mailDomainRecords ?? null}
                  checkedAt={p?.mailDomainCheckedAt ? dmy(p.mailDomainCheckedAt) : null}
                  sharedDomain={sharedDomain}
                  canRemove={ctx.role === "owner"}
                  canEdit={admin}
                  via={p?.mailDomainVia ?? null}
                  suggested={host(p?.website) ?? host(p?.email)}
                  resendConnected={Boolean(st.resend)}
                />
              </Configure>
            ) : null
          }
        />
      );
    }
    else if (tab === "usage") {
      actions = <RefreshUsage />;
      body = (
        <div className="grid max-w-4xl gap-4">
          <UsageBars usage={usage.usage} />
          <Panel title="Where this comes from">
            <div className="grid gap-2 text-sm text-muted-foreground">
              {usage.source === "resend" ? (
                <p>
                  Live from {via}, on the <b className="font-medium text-foreground">{usage.plan === "free" ? "free" : "paid"} plan</b>. Counts include mail your domain receives, as Resend counts it.
                  {usage.checkedAt ? <span suppressHydrationWarning> Read {usage.checkedAt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}.</span> : null}
                </p>
              ) : (
                <p>
                  Emails your agency sent through Lodgely’s shared sending, measured against the same allowance as Resend’s free plan ({FREE_TIER.daily} a day, {FREE_TIER.monthly.toLocaleString()} a month). Mail sent from a connected Gmail or Outlook account doesn’t count. Days and months are counted in UTC.
                </p>
              )}
              {usage.source === "lodgely" ? (
                <p>
                  Need more?{" "}
                  <Link href="/app/settings/connectors" className="font-medium text-foreground underline-offset-2 hover:underline">
                    Connect your own Resend account
                  </Link>{" "}
                  and mail on your domain uses your own plan.
                </p>
              ) : null}
            </div>
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-1.5"><Bell className="size-3.5" /> Limit emails</span>}>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>Owners and admins get an email automatically at 80% and at 100% of the daily or monthly limit, once per period.</p>
              {p?.mailUsageAlerts?.length ? (
                <ul className="grid gap-1 text-[13px]">
                  {[...p.mailUsageAlerts].reverse().slice(0, 6).map((a) => {
                    const [period, date, at] = a.split(":");
                    return (
                      <li key={a} className="flex items-center gap-2">
                        <span className={cn("size-1.5 rounded-full", at === "100" ? "bg-rose-500" : "bg-amber-500")} />
                        {at}% of the {period} limit · period ending {date}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px]">None sent yet.</p>
              )}
            </div>
          </Panel>
        </div>
      );
    } else {
      const mine = st.connections.filter((c) => c.userId === ctx.userId);
      body = (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Panel title="How your email works">
            <ol className="grid gap-4">
              {[
                { icon: Send, title: "Sending", text: own ? `From @${own} through ${via}. Shared @${sharedDomain} addresses keep working.` : `From your agency's @${sharedDomain} addresses through ${via}.`, href: "/app/settings/connectors", cta: usage.source === "resend" ? "Manage Resend" : "Use your own Resend" },
                { icon: AtSign, title: "Your domain", text: p?.mailDomain ? `${p.mailDomain} is ${(p.mailDomainStatus ?? "pending").replace(/_/g, " ")}.` : "Not added yet. Clients see the shared domain.", href: "/app/settings/email?tab=domain", cta: p?.mailDomain ? "Domain settings" : "Add your domain" },
                { icon: Inbox, title: "Receiving", text: `Replies to any address below land in the Inbox and are filed to the right client.${mine.length ? ` Your ${mine.map((c) => c.email).join(", ")} syncs too.` : ""}`, href: "/app/inbox", cta: "Open Inbox" },
              ].map((s) => (
                <li key={s.title} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <s.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-[13px] text-muted-foreground">{s.text}</p>
                    <Link href={s.href} className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium underline-offset-2 hover:underline">
                      {s.cta} <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <div className="grid content-start gap-4">
            <Panel title="Sending this period" action={<Link href="/app/settings/email?tab=usage" className="text-[12px] text-muted-foreground hover:text-foreground">Details</Link>}>
              <UsageBars usage={usage.usage} compact />
            </Panel>
            <Panel title={`Addresses (${st.mailboxes.length + mine.length})`}>
              <ul className="grid gap-1.5">
                {mine.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-[13px]">
                    <Mark kind={c.provider} size="sm" className="size-5 rounded-md text-[10px]" />
                    <span className="truncate">{c.email}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">yours</span>
                  </li>
                ))}
                {st.mailboxes
                  .filter((m) => !mine.some((c) => c.email === m.address))
                  .map((m) => (
                    <li key={m.address} className="flex items-center gap-2 text-[13px]">
                      <span className={cn("size-1.5 shrink-0 rounded-full", own && m.address.endsWith(`@${own}`) ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                      <span className="truncate font-mono text-[12px]">{m.address}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{m.kind === "shared" ? "team" : (m.name ?? "").split(" ")[0]}</span>
                    </li>
                  ))}
              </ul>
            </Panel>
          </div>
        </div>
      );
    }
  }

  return (
    <SettingsShell section={section} tab={tab} actions={actions}>
      <ConnectToasts />
      {body}
    </SettingsShell>
  );
}

export default function SettingsSectionPage(props: PageProps<"/app/settings/[section]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="team">
        <Section {...props} />
      </Guard>
    </Suspense>
  );
}
