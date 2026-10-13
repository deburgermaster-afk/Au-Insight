import { Configure } from "@/components/settings/configure";
import { Pill, Summary } from "@/components/settings/summary";
import { aud, dmy } from "@/lib/format";
import { scaleFor, type TaxProfile, withhold } from "@/lib/payg";
import { CESSATION_TYPES, hourlyOf, INCOME_TYPES } from "@/lib/payroll";
import { positionLabel } from "@/lib/permissions";
import { BankForm, type EmployeeProfile, EmploymentForm, PayForm, PersonalForm, SuperForm, TaxForm } from "./employee-forms";

type Profile = Record<string, unknown> & {
  userId: string;
  givenName: string | null;
  middleName: string | null;
  familyName: string | null;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  personalEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  addressState: string | null;
  postcode: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  tfnStatus: string;
  residency: string;
  taxFreeThreshold: boolean;
  stsl: boolean;
  medicareExemption: string;
  extraWithholding: string | null;
  tfnDeclaredAt: Date | null;
  superType: string;
  superFund: string | null;
  superUsi: string | null;
  superAbn: string | null;
  superMember: string | null;
  smsfEsa: string | null;
  superChoiceAt: Date | null;
  salarySacrificeSuper: string | null;
  bankAccountName: string | null;
  bankBsb: string | null;
  bankAccount: string | null;
  position: string;
  title: string | null;
  employment: string;
  startDate: string | null;
  endDate: string | null;
  cessationType: string | null;
  incomeType: string;
  homeCountry: string | null;
  payrollId: string | null;
  payType: string;
  payRate: string | null;
  hoursPerWeek: string;
  payFrequency: string | null;
  superRate: string;
  extraSuperRate: string | null;
  awardCode: string | null;
  awardName: string | null;
  classification: string | null;
  classificationRate: string | null;
  marn: string | null;
  managerId: string | null;
};

const plain = (p: Profile | null): EmployeeProfile => (p ? (JSON.parse(JSON.stringify(p)) as EmployeeProfile) : null);
const miss = (v: unknown) => v == null || v === "";
const GENDER: Record<string, string> = { female: "Female", male: "Male", other: "Non-binary or other", unspecified: "Prefer not to say" };
const EMP: Record<string, string> = { full_time: "Full time", part_time: "Part time", casual: "Casual", contractor: "Contractor" };

export function taxOf(p: Profile, whmRegistered: boolean): TaxProfile {
  return { tfnProvided: p.tfnStatus !== "none", residency: p.residency as TaxProfile["residency"], taxFreeThreshold: p.taxFreeThreshold, stsl: p.stsl, medicareExemption: p.medicareExemption as TaxProfile["medicareExemption"], extraWithholding: Number(p.extraWithholding ?? 0), whmRegistered };
}

/** Personal, tax, super and bank sections: shared by HR (userId set) and the employee themselves. */
export function EmployeeSelfSections({ p, userId, tfnLast3, settings, show }: { p: Profile | null; userId?: string; tfnLast3: string | null; settings: { whmRegistered: boolean; defaultFundName: string | null; frequency: string }; show: ("personal" | "tax" | "super" | "bank")[] }) {
  const freq = (p?.payFrequency ?? settings.frequency) as "weekly" | "fortnightly" | "monthly";
  const n = freq === "weekly" ? 52 : freq === "fortnightly" ? 26 : 12;
  const gross = p?.payRate ? (p.payType === "hourly" ? Number(p.payRate) * Number(p.hoursPerWeek) * (52 / n) : Number(p.payRate) / n) : 0;
  const tax = p ? taxOf(p, settings.whmRegistered) : null;
  const preview = p && gross > 0 && p.tfnDeclaredAt ? withhold(Math.round(gross * 100) / 100, freq, tax!) : null;
  const self = !userId;
  return (
    <div className="grid gap-3">
      {show.includes("personal") ? (
        <Summary
          title="Personal details"
          description="Legal name, date of birth and home address are reported to the ATO."
          status={p?.givenName && p.dob && p.addressLine1 ? <Pill tone="ok">Complete</Pill> : <Pill tone="warn">Needed for payroll</Pill>}
          action={
            <Configure title="Personal details" label={self ? "Update" : "Edit"} size="lg">
              <PersonalForm p={plain(p)} userId={userId} />
            </Configure>
          }
          rows={[
            { label: "Legal name", value: [p?.givenName, p?.middleName, p?.familyName].filter(Boolean).join(" ") || "Not set", missing: miss(p?.givenName) },
            { label: "Date of birth", value: p?.dob ? dmy(p.dob) : "Not set", missing: miss(p?.dob) },
            { label: "Gender", value: p?.gender ? GENDER[p.gender] : "—" },
            { label: "Mobile", value: p?.phone ?? "—" },
            { label: "Personal email", value: p?.personalEmail ?? "—" },
            { label: "Home address", value: p?.addressLine1 ? `${p.addressLine1}${p.addressLine2 ? `, ${p.addressLine2}` : ""}, ${p.suburb ?? ""} ${p.addressState ?? ""} ${p.postcode ?? ""}` : "Not set", missing: miss(p?.addressLine1) },
            { label: "Emergency contact", value: p?.emergencyName ? `${p.emergencyName}${p.emergencyRelation ? ` (${p.emergencyRelation})` : ""} · ${p.emergencyPhone ?? ""}` : "—" },
          ]}
        />
      ) : null}
      {show.includes("tax") ? (
        <Summary
          title="Tax (TFN declaration)"
          description="Decides the ATO tax scale. PAYG is worked out from the ATO's 2026–27 formulas each pay."
          status={p?.tfnDeclaredAt ? <Pill tone="ok">Declared {dmy(p.tfnDeclaredAt)}</Pill> : <Pill tone="warn">Not declared</Pill>}
          action={
            <Configure title="TFN declaration" description="The same questions as the ATO's TFN declaration form." label={p?.tfnDeclaredAt ? (self ? "Update" : "Edit") : "Complete"} size="lg">
              <TaxForm p={plain(p)} userId={userId} tfnLast3={tfnLast3} whmRegistered={settings.whmRegistered} sample={gross > 0 ? { gross: Math.round(gross * 100) / 100, frequency: freq } : undefined} />
            </Configure>
          }
          rows={[
            { label: "TFN", value: p?.tfnStatus === "provided" ? (tfnLast3 ? `••• ••• ${tfnLast3}` : "Missing") : ({ pending: "Applied for", under18: "Under 18 exemption", pensioner: "Pensioner exemption", none: "Not provided (47%)" } as Record<string, string>)[p?.tfnStatus ?? "none"], missing: !p?.tfnDeclaredAt },
            { label: "Residency", value: ({ resident: "Australian resident", foreign: "Foreign resident", whm: `Working holiday maker${p?.homeCountry ? ` (${p.homeCountry})` : ""}` } as Record<string, string>)[p?.residency ?? "resident"] },
            { label: "Tax-free threshold", value: p?.taxFreeThreshold && p.residency === "resident" ? "Claimed" : "Not claimed" },
            { label: "Study loan", value: p?.stsl ? "Yes" : "No" },
            { label: "Medicare levy", value: ({ none: "Full levy", half: "Half exemption", full: "Full exemption" } as Record<string, string>)[p?.medicareExemption ?? "none"] },
            { label: "Tax scale", value: tax ? scaleFor(tax).label : "—" },
            ...(preview ? [{ label: `Withholding on ${aud(gross, 2)} ${freq}`, value: `${aud(preview.tax)}${preview.stsl ? ` incl. ${aud(preview.stsl)} study loan` : ""}` }] : []),
          ]}
        />
      ) : null}
      {show.includes("super") ? (
        <Summary
          title="Super"
          description="12% super guarantee, paid within 7 days of each payday (Payday Super)."
          status={p?.superChoiceAt ? <Pill tone="ok">Choice made {dmy(p.superChoiceAt)}</Pill> : <Pill tone="warn">No choice yet</Pill>}
          action={
            <Configure title="Super choice" description="Where your super guarantee goes." label={p?.superChoiceAt ? (self ? "Update" : "Edit") : "Choose fund"} size="lg">
              <SuperForm p={plain(p)} userId={userId} defaultFund={settings.defaultFundName} allowSacrifice={self} />
            </Configure>
          }
          rows={[
            { label: "Fund", value: p?.superType === "default" ? `Agency default${settings.defaultFundName ? ` · ${settings.defaultFundName}` : ""}` : p?.superFund ?? (p?.superType === "smsf" ? "Self-managed fund" : "Not set"), missing: !p?.superChoiceAt },
            { label: "USI / ESA", value: p?.superType === "smsf" ? p.smsfEsa ?? "—" : p?.superUsi ?? "—" },
            { label: "Fund ABN", value: p?.superAbn ?? "—" },
            { label: "Member number", value: p?.superMember ?? "—" },
            { label: "Salary sacrifice", value: p?.salarySacrificeSuper ? `${aud(p.salarySacrificeSuper, 2)} a pay` : "None" },
            { label: "Employer rate", value: `${Number(p?.superRate ?? 12)}%${p?.extraSuperRate ? ` + ${Number(p.extraSuperRate)}% extra` : ""}` },
          ]}
        />
      ) : null}
      {show.includes("bank") ? (
        <Summary
          title="Bank account"
          description="Net pay goes here. Included in the ABA bank file."
          status={p?.bankAccount ? <Pill tone="ok">Set</Pill> : <Pill tone="warn">Not set</Pill>}
          action={
            <Configure title="Bank account" label={self ? "Update" : "Edit"}>
              <BankForm p={plain(p)} userId={userId} />
            </Configure>
          }
          rows={[
            { label: "Account name", value: p?.bankAccountName ?? "—" },
            { label: "BSB and account", value: p?.bankBsb ? `${p.bankBsb} · •••${(p.bankAccount ?? "").slice(-3)}` : "Not set", missing: miss(p?.bankAccount) },
          ]}
        />
      ) : null}
    </div>
  );
}

/** HR-only: position, employment, STP codes, pay rate and award. */
export function EmploymentSections({ p, userId, managers, settings, awardConnected }: { p: Profile | null; userId: string; managers: { id: string; name: string }[]; settings: { frequency: string }; awardConnected: boolean }) {
  const rate = p?.payRate ? hourlyOf({ payType: p.payType, payRate: Number(p.payRate), hoursPerWeek: Number(p.hoursPerWeek) }) : null;
  const award = p?.classificationRate ? Number(p.classificationRate) : null;
  return (
    <div className="grid gap-3">
      <Summary
        title="Employment"
        description="Role, dates and the codes Single Touch Payroll reports."
        action={
          <Configure title="Employment" size="lg" label="Edit">
            <EmploymentForm p={plain(p)} userId={userId} managers={managers} />
          </Configure>
        }
        rows={[
          { label: "Position", value: positionLabel((p?.position ?? "consultant") as "consultant") },
          { label: "Job title", value: p?.title ?? "—" },
          { label: "Employment", value: EMP[p?.employment ?? "full_time"] },
          { label: "Income type", value: INCOME_TYPES.find((x) => x.code === p?.incomeType)?.label ?? "Salary and wages" },
          { label: "Started", value: p?.startDate ? dmy(p.startDate) : "Not set", missing: miss(p?.startDate) },
          { label: "Finished", value: p?.endDate ? `${dmy(p.endDate)} · ${CESSATION_TYPES.find((c) => c.code === p.cessationType)?.label ?? ""}` : "—" },
          { label: "Payroll ID", value: p?.payrollId ?? "Automatic" },
          { label: "Manager", value: managers.find((m) => m.id === p?.managerId)?.name ?? "—" },
        ]}
      />
      <Summary
        title="Pay"
        description="Rate, frequency, super and award. Pay runs check it against the minimum wage and award."
        status={rate && award && rate < award - 0.005 ? <Pill tone="bad">Below award</Pill> : rate && rate < 26.44 && p?.employment !== "contractor" ? <Pill tone="bad">Below minimum wage</Pill> : p?.payRate ? <Pill tone="ok">Set</Pill> : <Pill tone="warn">No pay rate</Pill>}
        action={
          <Configure title="Pay" size="lg" label="Edit">
            <PayForm p={plain(p)} userId={userId} defaultFrequency={settings.frequency} awardConnected={awardConnected} />
          </Configure>
        }
        rows={[
          { label: "Rate", value: p?.payRate ? (p.payType === "hourly" ? `${aud(p.payRate, 2)} an hour` : `${aud(p.payRate)} a year`) : "Not set", missing: miss(p?.payRate) },
          { label: "Hourly equivalent", value: rate ? `${aud(rate, 2)} · ${Number(p?.hoursPerWeek)} h/week` : "—" },
          { label: "Paid", value: (p?.payFrequency ?? settings.frequency).replace(/^\w/, (c) => c.toUpperCase()) },
          { label: "Super", value: `${Number(p?.superRate ?? 12)}%${p?.extraSuperRate ? ` + ${Number(p.extraSuperRate)}%` : ""}` },
          { label: "Award", value: p?.awardName ?? p?.awardCode ?? "Not set" },
          { label: "Classification", value: p?.classification ? `${p.classification}${award ? ` · min ${aud(award, 2)}/h` : ""}` : "—" },
        ]}
      />
    </div>
  );
}
