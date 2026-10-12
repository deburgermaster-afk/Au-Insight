import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { DetailsForm, SignOut } from "@/components/portal/profile";
import { requireClient } from "@/lib/client-auth";
import { daysUntil, dmy, initials } from "@/lib/format";

export const metadata = { title: "Profile" };

const mask = (v: string | null) => (v ? `${"•".repeat(Math.max(0, v.length - 3))}${v.slice(-3)}` : "—");

export default async function Profile() {
  const c = await requireClient();
  const k = c.client;
  const p = c.profile;
  const facts = [
    { k: "Date of birth", v: k.dateOfBirth ? dmy(k.dateOfBirth) : "—" },
    { k: "Nationality", v: k.nationality ?? "—" },
    { k: "Passport", v: mask(k.passportNumber) },
    { k: "Passport expiry", v: k.passportExpiry ? dmy(k.passportExpiry) : "—" },
    { k: "Current visa", v: k.currentVisa ?? "—" },
    { k: "Visa expiry", v: k.visaExpiry ? `${dmy(k.visaExpiry)}${daysUntil(k.visaExpiry) < 90 ? " ⚠" : ""}` : "—" },
  ];
  return (
    <div className="grid gap-3">
      <section className="flex items-center gap-3 px-0.5 pt-1">
        <span className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-fuchsia-500 text-sm font-semibold text-white">{initials(`${k.firstName} ${k.lastName}`)}</span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {k.firstName} {k.lastName}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{k.email}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <p className="border-b px-3 py-2 text-xs font-medium">Your details on file</p>
        <dl className="grid grid-cols-2">
          {facts.map((f, i) => (
            <div key={f.k} className={`px-3 py-2 ${i % 2 === 0 ? "border-r" : ""} ${i < facts.length - 2 ? "border-b" : ""}`}>
              <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{f.k}</dt>
              <dd className="truncate text-[13px]">{f.v}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Something wrong? Message your agent; identity details can only be changed with evidence.</p>
      </section>

      <DetailsForm phone={k.phone} address={k.address} city={k.city} state={k.state} />

      <section className="overflow-hidden rounded-xl border bg-card">
        <p className="border-b px-3 py-2 text-xs font-medium">{c.agency.name}</p>
        <ul className="divide-y text-[13px]">
          {p?.phone ? (
            <li>
              <a href={`tel:${p.phone.replace(/\s|\(|\)/g, "")}`} className="flex items-center gap-2.5 px-3 py-2">
                <Phone className="size-3.5 text-muted-foreground" /> {p.phone}
              </a>
            </li>
          ) : null}
          {p?.email ? (
            <li>
              <a href={`mailto:${p.email}`} className="flex items-center gap-2.5 px-3 py-2">
                <Mail className="size-3.5 text-muted-foreground" /> {p.email}
              </a>
            </li>
          ) : null}
          {p?.address ? (
            <li className="flex items-center gap-2.5 px-3 py-2">
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" /> <span className="truncate">{p.address}</span>
            </li>
          ) : null}
          {p?.website ? (
            <li>
              <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3 py-2">
                <Globe className="size-3.5 text-muted-foreground" /> {p.website.replace(/^https?:\/\//, "")}
              </a>
            </li>
          ) : null}
        </ul>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {p?.marn ? `Registered migration agent, MARN ${p.marn}. ` : ""}Agents follow the Code of Conduct; read the{" "}
          <a href="https://www.mara.gov.au/get-help-visa-subsite/FIles/consumer_guide_english.pdf" target="_blank" rel="noreferrer" className="underline">
            Consumer Guide
          </a>
          .
        </p>
      </section>

      <SignOut />
    </div>
  );
}
