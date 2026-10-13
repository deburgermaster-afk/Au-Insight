"use client";

import { ExternalLink, KeyRound, Loader2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { savePayrollSettings } from "@/lib/payroll-actions";
import { connectAbr, connectEmploymentHero, connectFwc, disconnectPayroll } from "@/lib/payroll-integration-actions";
import { cn } from "@/lib/utils";
import { useConfigure } from "./configure";

type S = Record<string, string | number | boolean | null>;
const val = (s: S, k: string) => (s[k] == null ? "" : String(s[k]));
const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((x) => ({ value: x, label: x }));

function SettingsForm({ children, complete }: { children: ReactNode; complete?: boolean }) {
  const [pending, start] = useTransition();
  const popup = useConfigure();
  const router = useRouter();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (complete) f.set("complete", "1");
        start(async () => {
          const r = await savePayrollSettings(f);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Saved");
          popup?.close();
          router.refresh();
        });
      }}
    >
      {children}
      <Button className="justify-self-end rounded-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Save
      </Button>
    </form>
  );
}

export function EmployerForm({ s }: { s: S }) {
  const [whm, setWhm] = useState(Boolean(s.whmRegistered));
  return (
    <SettingsForm complete>
      <p className="text-[12px] text-muted-foreground">These go on every Single Touch Payroll report. The ABN and legal name come from Agency profile.</p>
      <Row cols={3}>
        <TextField label="STP contact name" name="contactName" defaultValue={val(s, "contactName")} required />
        <TextField label="Contact email" name="contactEmail" type="email" defaultValue={val(s, "contactEmail")} />
        <TextField label="Contact phone" name="contactPhone" defaultValue={val(s, "contactPhone")} />
      </Row>
      <Row>
        <TextField label="Business address" name="addressLine1" defaultValue={val(s, "addressLine1")} required />
        <TextField label="Suburb" name="suburb" defaultValue={val(s, "suburb")} required />
      </Row>
      <Row cols={3}>
        <SelectField label="State" name="addressState" defaultValue={val(s, "addressState") || undefined} options={STATES} required />
        <TextField label="Postcode" name="postcode" defaultValue={val(s, "postcode")} inputMode="numeric" maxLength={4} required />
        <TextField label="ABN branch" name="branch" defaultValue={val(s, "branch") || "001"} hint="001 unless the ATO gave you branches" />
      </Row>
      <TextField label="Who declares STP reports are correct" name="stpDeclarationName" defaultValue={val(s, "stpDeclarationName")} placeholder="Full name of the principal or payroll officer" required />
      <SelectField
        label="How STP reports reach the ATO"
        name="stpVia"
        defaultValue={val(s, "stpVia") || "file"}
        options={[
          { value: "file", label: "Export from Lodgely to a registered STP solution" },
          { value: "employment_hero", label: "Employment Hero Payroll (synced from Lodgely)" },
          { value: "xero", label: "Xero Payroll" },
        ]}
      />
      <input type="hidden" name="whmRegisteredSet" value="1" />
      <label className="flex items-start gap-2.5 text-[13px]">
        <Checkbox name="whmRegistered" checked={whm} onCheckedChange={(c) => setWhm(c === true)} className="mt-0.5" />
        <span>
          Registered with the ATO as an employer of working holiday makers
          <span className="block text-[11px] text-muted-foreground">Lets you withhold 15% on their first $45,000. Without it, foreign resident rates apply.</span>
        </span>
      </label>
    </SettingsForm>
  );
}

export function CalendarForm({ s }: { s: S }) {
  return (
    <SettingsForm>
      <Row cols={3}>
        <SelectField
          label="Pay frequency"
          name="frequency"
          defaultValue={val(s, "frequency") || "fortnightly"}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "fortnightly", label: "Fortnightly" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
        <TextField label="Next period starts" name="periodStart" type="date" defaultValue={val(s, "periodStart")} hint="Pay runs roll forward from here" />
        <TextField label="Days after period to pay" name="payLagDays" defaultValue={val(s, "payLagDays") || "2"} inputMode="numeric" />
      </Row>
      <Row>
        <TextField label="Default award code" name="awardCode" defaultValue={val(s, "awardCode")} placeholder="MA000002" />
        <TextField label="Default award name" name="awardName" defaultValue={val(s, "awardName")} placeholder="Clerks—Private Sector Award 2020" />
      </Row>
    </SettingsForm>
  );
}

export function SuperSettingsForm({ s }: { s: S }) {
  return (
    <SettingsForm>
      <p className="text-[12px] text-muted-foreground">The default fund is used only when a new employee doesn&apos;t choose a fund and the ATO has no stapled fund for them. It must offer a MySuper product.</p>
      <TextField label="Default fund name" name="defaultFundName" defaultValue={val(s, "defaultFundName")} placeholder="e.g. AustralianSuper" />
      <Row>
        <TextField label="Fund USI (MySuper)" name="defaultFundUsi" defaultValue={val(s, "defaultFundUsi")} placeholder="STA0100AU" />
        <TextField label="Fund ABN" name="defaultFundAbn" defaultValue={val(s, "defaultFundAbn")} inputMode="numeric" />
      </Row>
      <SelectField
        label="Clearing house you pay super through"
        name="clearingHouse"
        defaultValue={val(s, "clearingHouse") || undefined}
        options={[
          { value: "beam", label: "Beam (Australian Retirement Trust)" },
          { value: "quicksuper", label: "QuickSuper" },
          { value: "clicksuper", label: "ClickSuper" },
          { value: "superchoice", label: "SuperChoice" },
          { value: "fund", label: "Directly through our default fund's employer portal" },
          { value: "other", label: "Another SuperStream clearing house" },
        ]}
      />
    </SettingsForm>
  );
}

export function BankFileForm({ s }: { s: S }) {
  return (
    <SettingsForm>
      <p className="text-[12px] text-muted-foreground">The ABA file pays everyone&apos;s net pay in one upload to your bank. Your bank gives you a direct entry user ID (APCA number) when you set up batch payments.</p>
      <Row>
        <TextField label="Account name" name="payAccountName" defaultValue={val(s, "payAccountName")} />
        <TextField label="Bank code" name="payBankCode" defaultValue={val(s, "payBankCode")} placeholder="CBA, WBC, NAB, ANZ…" maxLength={3} />
      </Row>
      <Row cols={3}>
        <TextField label="BSB" name="payBsb" defaultValue={val(s, "payBsb")} inputMode="numeric" />
        <TextField label="Account number" name="payAccount" defaultValue={val(s, "payAccount")} inputMode="numeric" />
        <TextField label="Direct entry user ID" name="apcaId" defaultValue={val(s, "apcaId")} inputMode="numeric" maxLength={6} />
      </Row>
      <Row>
        <TextField label="Wages expense account" name="expenseAccount" defaultValue={val(s, "expenseAccount") || "Wages and salaries"} hint="Name or code in your accounts" />
        <TextField label="Super expense account" name="superExpenseAccount" defaultValue={val(s, "superExpenseAccount") || "Superannuation"} />
      </Row>
    </SettingsForm>
  );
}

type Conn = { kind: string; status: string; account: string | null; lastError: string | null; connectedByName: string | null };

const DEFS: Record<string, { name: string; by: string; blurb: string; how: ReactNode; label: string; placeholder: string }> = {
  fwc: {
    name: "Fair Work pay rates",
    by: "Fair Work Commission",
    blurb: "Official, current minimum rates for every award classification. Used to set and check each person's pay.",
    how: (
      <>
        Create a free account at{" "}
        <a href="https://developer.fwc.gov.au/" target="_blank" rel="noreferrer" className="underline">
          developer.fwc.gov.au
        </a>
        , subscribe to the Modern Awards Pay Database API, then copy your primary key from your profile.
      </>
    ),
    label: "Subscription key",
    placeholder: "32-character key",
  },
  abr: {
    name: "ABN Lookup",
    by: "Australian Business Register",
    blurb: "Checks ABNs for your agency, super funds and contractors.",
    how: (
      <>
        Register for a free GUID at{" "}
        <a href="https://abr.business.gov.au/Tools/WebServices" target="_blank" rel="noreferrer" className="underline">
          abr.business.gov.au
        </a>
        . It arrives by email.
      </>
    ),
    label: "Authentication GUID",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  },
  employment_hero: {
    name: "Employment Hero Payroll",
    by: "Employment Hero (KeyPay)",
    blurb: "Sends staff details, tax, bank and super to Employment Hero, which lodges STP and pays super through its clearing house.",
    how: <>In Employment Hero Payroll, click your name → My Account → API Key → Generate.</>,
    label: "API key",
    placeholder: "Your Employment Hero API key",
  },
};

/** Payroll integrations: government data, payroll and accounting. Keys are encrypted and never shown again. */
export function PayrollIntegrations({ conns, xeroReady, platform, canEdit }: { conns: Conn[]; xeroReady: boolean; platform: { fwc: boolean; abr: boolean }; canEdit: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[] | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const connect = (kind: string, businessId?: string) =>
    start(async () => {
      const r = kind === "fwc" ? await connectFwc(key) : kind === "abr" ? await connectAbr(key) : await connectEmploymentHero(key, businessId);
      if (!r.ok) return void toast.error(r.error);
      if ("businesses" in r && Array.isArray(r.businesses)) return setBusinesses(r.businesses as { id: string; name: string }[]);
      toast.success(`${DEFS[kind].name} connected`);
      setOpen(null);
      setKey("");
      setBusinesses(null);
      router.refresh();
    });
  const tile = (kind: string, name: string, by: string, blurb: string, action: ReactNode, state: string | null, error?: string | null) => (
    <li key={kind} className="grid gap-2 rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-[11px] text-muted-foreground">{by}</p>
        </div>
        {state ? <span className={cn("rounded-full px-2 py-0.5 text-[11px]", state.startsWith("Connected") || state.startsWith("Included") ? "bg-emerald-500/12 text-emerald-500" : "bg-amber-500/12 text-amber-500")}>{state}</span> : null}
      </div>
      <p className="text-[12px] text-muted-foreground">{blurb}</p>
      {error ? <p className="text-[12px] text-rose-500">{error}</p> : null}
      <div className="flex gap-2">{action}</div>
    </li>
  );
  const find = (k: string) => conns.find((c) => c.kind === k);
  const disconnect = (k: string) =>
    start(async () => {
      const r = await disconnectPayroll(k as "fwc");
      if (!r.ok) return void toast.error(r.error);
      toast.success("Disconnected");
      router.refresh();
    });
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {(["fwc", "abr", "employment_hero"] as const).map((k) => {
          const c = find(k);
          const d = DEFS[k];
          const viaPlatform = !c && (k === "fwc" ? platform.fwc : k === "abr" ? platform.abr : false);
          return tile(
            k,
            d.name,
            d.by,
            d.blurb,
            canEdit ? (
              c ? (
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => disconnect(k)}>
                  <Unplug /> Disconnect
                </Button>
              ) : (
                <Button size="xs" onClick={() => (setOpen(k), setKey(""), setBusinesses(null))}>
                  <KeyRound /> {viaPlatform ? "Use your own key" : "Connect"}
                </Button>
              )
            ) : null,
            c ? `Connected${c.account ? ` · ${c.account}` : ""}` : viaPlatform ? "Included with Lodgely" : null,
            c?.lastError,
          );
        })}
        {tile(
          "xero",
          "Xero",
          "Accounting",
          "Posts each finalised pay run to Xero as a draft manual journal: wages, super, PAYG and net pay.",
          canEdit ? (
            find("xero") ? (
              <Button size="xs" variant="ghost" disabled={pending} onClick={() => disconnect("xero")}>
                <Unplug /> Disconnect
              </Button>
            ) : xeroReady ? (
              <Button size="xs" asChild>
                <a href="/api/connect/xero/start">
                  <ExternalLink /> Connect Xero
                </a>
              </Button>
            ) : (
              <span className="text-[12px] text-muted-foreground">Lodgely&apos;s Xero app isn&apos;t set up on this server yet. Use the journal CSV meanwhile.</span>
            )
          ) : null,
          find("xero") ? `Connected · ${find("xero")!.account}` : xeroReady ? null : "Needs setup",
        )}
        {tile("clearing", "Super clearing houses", "Beam, QuickSuper, ClickSuper, SuperChoice", "Each pay run gives you a contribution file with the fields SuperStream needs (TFN, fund USI or SMSF ESA, member number, amounts). Upload it to your clearing house, then mark contributions paid.", null, "Included")}
        {tile("ato", "ATO Single Touch Payroll", "Australian Taxation Office", "Lodging to the ATO needs software the ATO has registered. Lodgely prepares and checks each STP Phase 2 report and hands it to Employment Hero, Xero or any registered STP solution.", null, null)}
      </ul>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>Connect {DEFS[open].name}</DialogTitle>
                <DialogDescription>{DEFS[open].how}</DialogDescription>
              </DialogHeader>
              {businesses ? (
                <div className="grid gap-1.5">
                  <p className="text-[12px] text-muted-foreground">Which business is this agency?</p>
                  {businesses.map((b) => (
                    <Button key={b.id} variant="outline" className="justify-start" disabled={pending} onClick={() => connect(open, b.id)}>
                      {b.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    connect(open);
                  }}
                >
                  <TextField label={DEFS[open].label} name="key" value={key} onChange={(e) => setKey(e.target.value)} placeholder={DEFS[open].placeholder} autoComplete="off" type="password" />
                  <p className="text-[11px] text-muted-foreground">It&apos;s checked with the provider, then encrypted. Nobody can view it again, including you.</p>
                  <Button className="justify-self-end rounded-full" disabled={pending || key.trim().length < 8}>
                    {pending ? <Loader2 className="animate-spin" /> : null} Check and connect
                  </Button>
                </form>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
