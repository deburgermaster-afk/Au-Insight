"use client";

import { Loader2, Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { toast } from "sonner";
import { Section } from "@/components/app/section";
import { Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompareTable, PlanCards } from "@/components/app/plans";
import { saveAgencyProfile } from "@/lib/actions";

type P = {
  bankName?: string | null;
  bankAccountName?: string | null;
  bankBsb?: string | null;
  bankAccount?: string | null;
  legalName: string | null;
  abn: string | null;
  marn: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  state: string | null;
  invoicePrefix: string;
  gstRegistered: boolean;
  nextInvoiceNumber: number;
} | null;

export function SettingsForm({ profile, slug, mailDomain }: { profile: P; slug: string; mailDomain: string | null }) {
  const [pending, start] = useTransition();
  const { theme, setTheme } = useTheme();
  return (
    <Tabs defaultValue="agency" className="gap-5">
      <TabsList>
        <TabsTrigger value="agency">Agency</TabsTrigger>
        <TabsTrigger value="plans">Plans</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="appearance">Appearance</TabsTrigger>
      </TabsList>
      <TabsContent value="plans" className="grid gap-8">
        <PlanCards />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Compare features by plan</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">Everything is unlocked during the beta.</p>
          <CompareTable />
        </div>
      </TabsContent>
      <TabsContent value="agency" className="max-w-3xl">
      <form
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const r = await saveAgencyProfile(f);
            if (r.ok) toast.success("Settings saved");
            else toast.error(r.error);
          });
        }}
      >
        <Section title="Agency">
          <div className="grid gap-4">
            <TextField label="Legal name" name="legalName" defaultValue={profile?.legalName ?? ""} />
            <Row>
              <TextField label="ABN" name="abn" defaultValue={profile?.abn ?? ""} inputMode="numeric" />
              <TextField label="Principal's MARN" name="marn" defaultValue={profile?.marn ?? ""} hint="Shown on invoices and agreements" />
            </Row>
            <Row>
              <TextField label="Phone" name="phone" defaultValue={profile?.phone ?? ""} />
              <TextField label="Email" name="email" type="email" defaultValue={profile?.email ?? ""} />
            </Row>
            <TextField label="Website" name="website" defaultValue={profile?.website ?? ""} />
            <Row>
              <TextField label="Address" name="address" defaultValue={profile?.address ?? ""} />
              <SelectField label="State" name="state" defaultValue={profile?.state ?? undefined} options={["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((s) => ({ value: s, label: s }))} />
            </Row>
          </div>
        </Section>
        <Section title="Invoicing">
          <div className="grid gap-4">
            <Row>
              <TextField label="Invoice prefix" name="invoicePrefix" defaultValue={profile?.invoicePrefix ?? "INV"} />
              <TextField label="Next number" value={String(profile?.nextInvoiceNumber ?? 1001)} disabled readOnly name="_next" />
            </Row>
            <label className="flex items-center gap-3 text-sm">
              <Switch name="gstRegistered" defaultChecked={profile?.gstRegistered ?? true} /> Registered for GST (adds 10% to professional fees)
            </label>
            <p className="text-xs text-muted-foreground">Client trust account: shown on invoices in the client portal, with the invoice number as the payment reference.</p>
            <Row>
              <TextField label="Bank" name="bankName" defaultValue={profile?.bankName ?? ""} placeholder="Commonwealth Bank" />
              <TextField label="Account name" name="bankAccountName" defaultValue={profile?.bankAccountName ?? ""} placeholder="Agency Pty Ltd Client Trust Account" />
            </Row>
            <Row>
              <TextField label="BSB" name="bankBsb" defaultValue={profile?.bankBsb ?? ""} inputMode="numeric" placeholder="062-000" />
              <TextField label="Account number" name="bankAccount" defaultValue={profile?.bankAccount ?? ""} inputMode="numeric" />
            </Row>
          </div>
        </Section>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save settings
          </Button>
        </div>
      </form>
      </TabsContent>
      <TabsContent value="email" className="max-w-3xl">
      <Section title="Email">
        <p className="text-sm text-muted-foreground">
          {mailDomain ? (
            <>
              Mail is sent from <span className="font-mono text-foreground">{slug}@{mailDomain}</span> with replies going to each staff member.
            </>
          ) : (
            <>Sending is off until a mail domain is connected. Messages are still saved to the mailbox and filed to clients.</>
          )}
        </p>
      </Section>
      </TabsContent>
      <TabsContent value="appearance">
      <Section title="Appearance">
        <ToggleGroup type="single" value={theme} onValueChange={(v) => v && setTheme(v)} variant="outline">
          <ToggleGroupItem value="light">
            <Sun /> Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark">
            <Moon /> Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="system">
            <SunMoon /> System
          </ToggleGroupItem>
        </ToggleGroup>
      </Section>
      </TabsContent>
    </Tabs>
  );
}
