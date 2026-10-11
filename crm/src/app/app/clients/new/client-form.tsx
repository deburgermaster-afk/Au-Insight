"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { AreaField, Row, SelectField, TextField } from "@/components/forms/fields";
import { Section } from "@/components/app/section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/actions";
import { visas } from "@/lib/visas";

const sources = ["Referral", "Website", "Walk-in", "Facebook", "Instagram", "Google", "Education agent", "Existing client", "Other"];

export function ClientForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        f.set("onshore", f.get("onshore") === "on" ? "on" : "off");
        start(async () => {
          const r = await createClient(f);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Client added");
          router.push(`/app/clients/${r.id}`);
        });
      }}
    >
      <Section title="Personal details">
        <div className="grid gap-4">
          <Row>
            <TextField label="First name" name="firstName" required autoFocus />
            <TextField label="Last name" name="lastName" required />
          </Row>
          <Row>
            <TextField label="Email" name="email" type="email" />
            <TextField label="Phone" name="phone" type="tel" placeholder="+61 4…" />
          </Row>
          <Row cols={3}>
            <TextField label="Date of birth" name="dateOfBirth" type="date" />
            <TextField label="Nationality" name="nationality" />
            <TextField label="Occupation" name="occupation" placeholder="Software engineer" />
          </Row>
        </div>
      </Section>
      <Section title="Passport & visa">
        <div className="grid gap-4">
          <Row>
            <TextField label="Passport number" name="passportNumber" />
            <TextField label="Passport expiry" name="passportExpiry" type="date" />
          </Row>
          <Row>
            <SelectField label="Current visa" name="currentVisa" options={visas.filter((v) => /^\d/.test(v.code)).map((v) => ({ value: v.code, label: `${v.code} · ${v.name}` }))} />
            <TextField label="Visa expiry" name="visaExpiry" type="date" />
          </Row>
          <label className="flex items-center gap-3 text-sm">
            <Switch name="onshore" defaultChecked /> Currently in Australia
          </label>
        </div>
      </Section>
      <Section title="Practice">
        <div className="grid gap-4">
          <Row cols={3}>
            <SelectField
              label="Stage"
              name="stage"
              defaultValue="lead"
              options={["lead", "prospect", "active", "on_hold"].map((s) => ({ value: s, label: s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()) }))}
            />
            <SelectField label="Source" name="source" options={sources.map((s) => ({ value: s.toLowerCase(), label: s }))} />
            <SelectField label="Case officer" name="assignedTo" options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Me" />
          </Row>
          <AreaField label="Notes" name="notes" placeholder="Goals, family situation, how they found you…" />
        </div>
      </Section>
      <div className="sticky bottom-4 z-10 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="shadow-lg shadow-primary/25">
          {pending ? <Loader2 className="animate-spin" /> : null} Add client
        </Button>
      </div>
    </form>
  );
}
