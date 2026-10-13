"use client";

import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Section } from "@/components/app/section";
import { Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveAgencyProfile } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useConfigure } from "./configure";

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

/** One form for the whole profile; the header tab only chooses which part is visible, so saving never blanks the other. */
export function AgencyForm({ profile, tab, canEdit }: { profile: P; tab: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const popup = useConfigure();
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveAgencyProfile(f);
          if (r.ok) {
            toast.success("Saved");
            popup?.close();
          }
          else toast.error(r.error);
        });
      }}
    >
      <fieldset disabled={!canEdit} className="contents">
        <div className={cn("grid gap-6", tab !== "details" && "hidden")}>
          <Section title="Agency">
            <div className="grid gap-4">
              <TextField label="Legal name" name="legalName" defaultValue={profile?.legalName ?? ""} />
              <Row>
                <TextField label="ABN" name="abn" defaultValue={profile?.abn ?? ""} inputMode="numeric" />
                <TextField label="Principal's MARN" name="marn" defaultValue={profile?.marn ?? ""} hint="Shown on invoices and agreements" />
              </Row>
            </div>
          </Section>
          <Section title="Contact">
            <div className="grid gap-4">
              <Row>
                <TextField label="Phone" name="phone" defaultValue={profile?.phone ?? ""} />
                <TextField label="Email" name="email" type="email" defaultValue={profile?.email ?? ""} />
              </Row>
              <TextField label="Website" name="website" defaultValue={profile?.website ?? ""} hint="Used to suggest your email domain" />
              <Row>
                <TextField label="Address" name="address" defaultValue={profile?.address ?? ""} />
                <SelectField label="State" name="state" defaultValue={profile?.state ?? undefined} options={["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((s) => ({ value: s, label: s }))} />
              </Row>
            </div>
          </Section>
        </div>
        <div className={cn("grid gap-6", tab !== "invoicing" && "hidden")}>
          <Section title="Invoicing">
            <div className="grid gap-4">
              <Row>
                <TextField label="Invoice prefix" name="invoicePrefix" defaultValue={profile?.invoicePrefix ?? "INV"} />
                <TextField label="Next number" value={String(profile?.nextInvoiceNumber ?? 1001)} disabled readOnly name="_next" />
              </Row>
              <label className="flex items-center gap-3 text-sm">
                <Switch name="gstRegistered" defaultChecked={profile?.gstRegistered ?? true} /> Registered for GST (adds 10% to professional fees)
              </label>
            </div>
          </Section>
          <Section title="Client trust account">
            <div className="grid gap-4">
              <p className="text-xs text-muted-foreground">Shown on invoices in the client portal, with the invoice number as the payment reference.</p>
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
        </div>
        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Only owners and admins can change these.</p>
        )}
      </fieldset>
    </form>
  );
}
