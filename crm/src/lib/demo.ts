import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Ctx } from "@/lib/session";
import { visaByCode } from "@/lib/visas";

// A realistic demo workspace for a new agency: clients across the pipeline, matters at every stage
// with their checklists, tasks, appointments, invoices with office and trust receipts, mail.

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const at = (offsetDays: number, hour: number, min = 0) => {
  const d = new Date(Date.now() + offsetDays * 864e5);
  d.setUTCHours(hour - 10, min, 0, 0); // AEST
  return d;
};

const people: [string, string, string, string, string, number, string, string][] = [
  // first, last, nationality, current visa, stage, visa expiry offset (days), occupation, source
  ["Aarav", "Sharma", "India", "500", "active", 41, "Software Engineer", "Referral"],
  ["Mei", "Lin", "China", "485", "active", 120, "Registered Nurse", "Website"],
  ["Istiak", "Rahman", "Bangladesh", "500", "active", 333, "ICT Security Specialist", "Walk-in"],
  ["Saima", "Akter", "Bangladesh", "500", "active", 333, "Civil Engineering Draftsperson", "Referral"],
  ["Lucas", "Oliveira", "Brazil", "417", "prospect", 22, "Chef", "Instagram"],
  ["Hana", "Kim", "South Korea", "482", "active", 610, "Accountant", "Employer"],
  ["Mohammed", "Al-Farsi", "Jordan", "600", "lead", 65, "Electrician", "Website"],
  ["Priya", "Nair", "India", "485", "active", 75, "Early Childhood Teacher", "Referral"],
  ["Tomás", "García", "Colombia", "500", "prospect", 190, "Carpenter", "Facebook"],
  ["Ngoc", "Tran", "Vietnam", "820", "active", 700, "Pharmacist", "Referral"],
  ["Emily", "Watson", "United Kingdom", "462", "lead", 150, "Physiotherapist", "Website"],
  ["Rizwan", "Qureshi", "Pakistan", "485", "active", 18, "Civil Engineer", "Walk-in"],
  ["Ana", "Santos", "Philippines", "482", "active", 400, "Aged Care Worker", "Employer"],
  ["Daniel", "Mensah", "Ghana", "500", "on_hold", 260, "Mechanical Engineer", "Agent network"],
  ["Sofia", "Rossi", "Italy", "417", "lead", 30, "Hairdresser", "Instagram"],
  ["Kenji", "Watanabe", "Japan", "600", "past", -20, "Chef", "Referral"],
  ["Fatima", "Yusuf", "Nigeria", "485", "active", 95, "Social Worker", "Website"],
  ["Arjun", "Patel", "India", "189", "past", 0, "Software Engineer", "Referral"],
];

export async function seedDemo(ctx: Ctx) {
  const a = ctx.agencyId;
  await db
    .update(s.agencyProfile)
    .set({ legalName: `${ctx.agencyName} Pty Ltd`, abn: "51 824 753 556", marn: "1795213", phone: "(02) 9000 1234", address: "Level 12, 1 Martin Place, Sydney NSW 2000", state: "NSW", website: "https://lodgely.app" })
    .where(eq(s.agencyProfile.agencyId, a));

  const [employer1, employer2] = await db
    .insert(s.employers)
    .values([
      { agencyId: a, name: "Harbour Aged Care", abn: "33 102 417 032", contactName: "Rachel Moore", contactEmail: "hr@harbouragedcare.com.au", industry: "Health care", sbsApproved: true, sbsExpiry: day(900) },
      { agencyId: a, name: "Northline Accounting", abn: "71 004 085 616", contactName: "Peter Chan", contactEmail: "peter@northline.com.au", industry: "Professional services", sbsApproved: true, sbsExpiry: day(420) },
      { agencyId: a, name: "Coastal Kitchens Group", abn: "12 345 678 901", contactName: "Marco Bianchi", contactEmail: "marco@coastalkitchens.com.au", industry: "Hospitality", sbsApproved: false },
    ])
    .returning({ id: s.employers.id });

  const clients = await db
    .insert(s.clients)
    .values(
      people.map(([firstName, lastName, nationality, currentVisa, stage, exp, occupation, source], i) => ({
        agencyId: a,
        firstName,
        lastName,
        nationality,
        countryOfBirth: nationality,
        currentVisa,
        visaExpiry: day(exp),
        occupation,
        source,
        stage: stage as typeof s.clients.$inferInsert.stage,
        email: `${firstName.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
        phone: `04${String(10000000 + i * 7654321).slice(0, 8)}`,
        dateOfBirth: day(-365 * (24 + (i % 12)) - i * 31),
        passportNumber: `${nationality.slice(0, 1)}${String(4400000 + i * 97531).slice(0, 7)}`,
        passportExpiry: day(400 + i * 60),
        englishTest: i % 3 === 0 ? "PTE Academic" : i % 3 === 1 ? "IELTS" : null,
        englishScore: i % 3 === 0 ? "79 each" : i % 3 === 1 ? "7.0 (no band < 6.5)" : null,
        city: ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth"][i % 5],
        state: ["NSW", "VIC", "QLD", "SA", "WA"][i % 5],
        onshore: !["Emily", "Mohammed"].includes(firstName),
        tags: i % 4 === 0 ? ["priority"] : i % 5 === 0 ? ["family"] : [],
        assignedTo: ctx.userId,
      })),
    )
    .returning({ id: s.clients.id, firstName: s.clients.firstName, lastName: s.clients.lastName });
  const byName = Object.fromEntries(clients.map((c) => [c.firstName, c.id]));

  const matterSpecs: { who: string; visa: string; stage: string; priority?: string; stream?: string; employer?: string; fee: number; gov: number; points?: number; outcome?: string }[] = [
    { who: "Aarav", visa: "190", stage: "documents", priority: "high", fee: 4400, gov: 4910, points: 85 },
    { who: "Mei", visa: "189", stage: "ready", priority: "high", fee: 4400, gov: 4910, points: 90 },
    { who: "Istiak", visa: "485", stage: "engaged", stream: "Post-Higher Education Work", fee: 1800, gov: 2235 },
    { who: "Saima", visa: "SA", stage: "documents", fee: 900, gov: 1250 },
    { who: "Lucas", visa: "500", stage: "consultation", fee: 1500, gov: 2000 },
    { who: "Hana", visa: "186", stage: "lodged", stream: "Temporary Residence Transition", employer: "2", fee: 5500, gov: 4910 },
    { who: "Mohammed", visa: "600", stage: "enquiry", fee: 660, gov: 195 },
    { who: "Priya", visa: "190", stage: "rfi", priority: "urgent", fee: 4400, gov: 4910, points: 80 },
    { who: "Tomás", visa: "500", stage: "consultation", fee: 1500, gov: 2000 },
    { who: "Ngoc", visa: "820/801", stage: "lodged", fee: 6600, gov: 9365 },
    { who: "Rizwan", visa: "491", stage: "documents", priority: "urgent", stream: "State or Territory nominated", fee: 4400, gov: 4910, points: 75 },
    { who: "Ana", visa: "186", stage: "engaged", stream: "Temporary Residence Transition", employer: "1", fee: 5500, gov: 4910 },
    { who: "Fatima", visa: "190", stage: "ready", fee: 4400, gov: 4910, points: 85 },
    { who: "Arjun", visa: "189", stage: "closed", fee: 4400, gov: 4910, points: 95, outcome: "granted" },
    { who: "Kenji", visa: "600", stage: "closed", fee: 660, gov: 195, outcome: "granted" },
    { who: "Daniel", visa: "ART", stage: "documents", priority: "high", fee: 3300, gov: 3496 },
  ];
  const matters = await db
    .insert(s.matters)
    .values(
      matterSpecs.map((m, i) => {
        const visa = visaByCode(m.visa);
        return {
          agencyId: a,
          clientId: byName[m.who],
          visaCode: m.visa,
          stream: m.stream,
          reference: `LDG-2026-${String(i + 1).padStart(4, "0")}`,
          title: `${visa?.name ?? m.visa} (${m.visa})`,
          stage: m.stage as typeof s.matters.$inferInsert.stage,
          priority: (m.priority ?? "normal") as typeof s.matters.$inferInsert.priority,
          assignedTo: ctx.userId,
          employerId: m.employer === "1" ? employer1.id : m.employer === "2" ? employer2.id : null,
          feeProfessional: String(m.fee),
          feeGovernment: String(m.gov),
          pointsClaimed: m.points,
          lodgedAt: ["lodged", "rfi", "decision", "closed"].includes(m.stage) ? day(-40 - i * 9) : null,
          trn: ["lodged", "rfi", "decision", "closed"].includes(m.stage) ? `EGO${String(64812300 + i * 1117)}` : null,
          decisionAt: m.outcome ? day(-5 - i) : null,
          outcome: m.outcome,
          dueAt: day(7 + i * 5),
        };
      }),
    )
    .returning({ id: s.matters.id, clientId: s.matters.clientId, visaCode: s.matters.visaCode, stage: s.matters.stage, reference: s.matters.reference });

  const items = matters.flatMap((m) => {
    const visa = visaByCode(m.visaCode);
    const progress = { enquiry: 0, consultation: 0, engaged: 0.15, documents: 0.5, ready: 1, lodged: 1, rfi: 0.9, decision: 1, closed: 1 }[m.stage] ?? 0;
    return (visa?.checklist ?? []).map((c, i, all) => ({
      agencyId: a,
      matterId: m.id,
      category: c.category,
      label: c.label,
      required: c.required !== false,
      sort: i,
      status: (i / all.length < progress ? (i % 4 === 0 ? "received" : "approved") : i / all.length < progress + 0.15 ? "requested" : "needed") as typeof s.checklistItems.$inferInsert.status,
    }));
  });
  if (items.length) await db.insert(s.checklistItems).values(items);

  const taskTitles = [
    ["Request police certificate from India", "Aarav", 2, "high"],
    ["Prepare points test breakdown", "Mei", 1, "normal"],
    ["Respond to s56 request for further information", "Priya", 3, "urgent"],
    ["Check CoE dates against visa expiry", "Istiak", 5, "normal"],
    ["Book health examinations", "Rizwan", 4, "high"],
    ["Draft cover letter for 186 TRT", "Ana", 6, "normal"],
    ["Send costs agreement and consumer guide", "Lucas", 1, "normal"],
    ["Follow up employer for nomination documents", "Ana", 0, "high"],
    ["Review relationship evidence bundle", "Ngoc", 9, "normal"],
    ["Prepare ART submissions", "Daniel", 12, "high"],
  ] as const;
  await db.insert(s.tasks).values(
    taskTitles.map(([title, who, due, priority], i) => ({
      agencyId: a,
      title,
      clientId: byName[who],
      matterId: matters.find((m) => m.clientId === byName[who])?.id,
      dueAt: at(due, 9 + (i % 6)),
      priority: priority as typeof s.tasks.$inferInsert.priority,
      status: (i === 1 ? "doing" : i === 7 ? "waiting" : "todo") as typeof s.tasks.$inferInsert.status,
      assignedTo: ctx.userId,
      createdBy: ctx.userId,
    })),
  );

  await db.insert(s.appointments).values([
    { agencyId: a, title: "Initial consultation", kind: "consultation", startsAt: at(0, 10), endsAt: at(0, 10, 45), location: "Video call", clientId: byName.Mohammed, staffId: ctx.userId, fee: "150" },
    { agencyId: a, title: "Document check", kind: "document check", startsAt: at(0, 14), endsAt: at(0, 14, 30), location: "Sydney office", clientId: byName.Aarav, staffId: ctx.userId },
    { agencyId: a, title: "Student visa planning", kind: "consultation", startsAt: at(1, 11), endsAt: at(1, 11, 45), location: "Phone", clientId: byName.Tomás, staffId: ctx.userId, fee: "150" },
    { agencyId: a, title: "Partner visa interview prep", kind: "interview", startsAt: at(2, 15), endsAt: at(2, 16), location: "Sydney office", clientId: byName.Ngoc, staffId: ctx.userId },
    { agencyId: a, title: "485 strategy session", kind: "follow-up", startsAt: at(3, 9, 30), endsAt: at(3, 10), location: "Video call", clientId: byName.Istiak, staffId: ctx.userId },
    { agencyId: a, title: "Working holiday options", kind: "consultation", startsAt: at(4, 13), endsAt: at(4, 13, 30), location: "Video call", clientId: byName.Sofia, staffId: ctx.userId, fee: "99" },
  ]);

  const invoiceSpecs = [
    ["Aarav", 2200, 2200, "partial", -20],
    ["Mei", 4400, 4400, "paid", -35],
    ["Hana", 5500, 5500, "paid", -60],
    ["Priya", 4400, 2000, "partial", -25],
    ["Ngoc", 6600, 6600, "paid", -90],
    ["Rizwan", 2200, 0, "overdue", -30],
    ["Lucas", 150, 0, "sent", -2],
    ["Fatima", 4400, 4400, "paid", -14],
  ] as const;
  const invoices = await db
    .insert(s.invoices)
    .values(
      invoiceSpecs.map(([who, fee, paid, status, offset], i) => ({
        agencyId: a,
        number: `INV-${1001 + i}`,
        clientId: byName[who],
        status: status as typeof s.invoices.$inferInsert.status,
        issuedAt: day(offset),
        dueAt: day(offset + 14),
        items: [{ description: "Professional fees: visa application", quantity: 1, unitPrice: fee / 1.1, gst: true }],
        subtotal: (fee / 1.1).toFixed(2),
        gst: (fee - fee / 1.1).toFixed(2),
        total: fee.toFixed(2),
        paid: paid.toFixed(2),
      })),
    )
    .returning({ id: s.invoices.id, clientId: s.invoices.clientId, paid: s.invoices.paid, number: s.invoices.number, issuedAt: s.invoices.issuedAt });
  await db.update(s.agencyProfile).set({ nextInvoiceNumber: 1001 + invoiceSpecs.length }).where(eq(s.agencyProfile.agencyId, a));
  const receipts = invoices
    .filter((i) => Number(i.paid) > 0)
    .map((i) => ({ agencyId: a, clientId: i.clientId, invoiceId: i.id, account: "office", kind: "receipt", amount: i.paid, method: "bank transfer", reference: i.number, occurredAt: i.issuedAt! }));
  const trust = [
    { who: "Ngoc", amount: "9365.00", memo: "Visa application charge held in trust" },
    { who: "Priya", amount: "4910.00", memo: "Visa application charge held in trust" },
    { who: "Rizwan", amount: "4910.00", memo: "VAC for 491 held in trust" },
  ].map((t, i) => ({ agencyId: a, clientId: byName[t.who], account: "trust", kind: "receipt", amount: t.amount, method: "bank transfer", reference: `TR-${2001 + i}`, occurredAt: day(-30 + i * 6), memo: t.memo }));
  const history = Array.from({ length: 6 }, (_, k) => ({ agencyId: a, account: "office", kind: "receipt", amount: String(9000 + ((k * 3779) % 9000)), method: "bank transfer", reference: `Historic ${k}`, occurredAt: day(-30 * (6 - k)), memo: "Professional fees" }));
  await db.insert(s.ledger).values([...receipts, ...trust, ...history]);

  const mails = [
    ["Mei Lin", "mei.lin@example.com", "Skills assessment outcome", "Hi, I just received my ANMAC outcome. It's positive! I've attached the letter. What's next?", 0, false],
    ["Home Affairs", "noreply@homeaffairs.gov.au", "Request for further information: Priya Nair", "We require additional information to continue processing this application. Please provide the requested documents within 28 days.", 0, false],
    ["Rachel Moore (Harbour Aged Care)", "hr@harbouragedcare.com.au", "Nomination paperwork for Ana", "Hi team, please find the signed position description and payslips for Ana Santos attached.", 1, true],
    ["Lucas Oliveira", "lucas.oliveira@example.com", "Question about student visa", "Can I work while studying a diploma of hospitality? And how much money do I need to show?", 1, false],
    ["Aarav Sharma", "aarav.sharma@example.com", "Police certificate", "I applied for the PCC through VFS. They said 3–4 weeks. Is that ok for our timeline?", 2, true],
    ["Northline Accounting", "peter@northline.com.au", "Hana's TRT application", "Thanks for lodging. Let us know if the department needs anything else from us.", 4, true],
  ] as const;
  await db.insert(s.messages).values(
    mails.map(([fromName, fromAddress, subject, body, ago, read], i) => ({
      agencyId: a,
      threadKey: `demo-${i}`,
      folder: "inbox",
      mailbox: ctx.email,
      fromName,
      fromAddress,
      toAddresses: [ctx.email],
      subject,
      bodyText: body,
      read,
      starred: i === 1,
      sentAt: at(-ago, 9 + i),
      clientId: byName[fromName.split(" ")[0]] ?? null,
    })),
  );

  const acts = [
    ["Mei", "email", "Skills assessment received", "ANMAC positive outcome; ready for EOI"],
    ["Priya", "system", "RFI received from Home Affairs", "28 days to respond"],
    ["Hana", "stage", "LDG-2026-0006 moved to lodged", null],
    ["Aarav", "call", "Phone call", "Discussed police certificate timing and state nomination criteria for NSW."],
    ["Istiak", "meeting", "Strategy meeting", "485 Post-Higher Education stream; expected completion March 2028."],
    ["Ngoc", "document", "Relationship evidence received", "Joint lease, bank statements, photos"],
  ] as const;
  await db.insert(s.activities).values(
    acts.map(([who, kind, title, body]) => ({ agencyId: a, clientId: byName[who], kind, title, body, actorId: ctx.userId, actorName: ctx.name })),
  );

  await db.insert(s.templates).values([
    { agencyId: a, kind: "email", name: "Document request", subject: "Documents needed for your {{visa}} application", body: "Hi {{firstName}},\n\nTo keep your application moving, please upload the following documents to your client portal:\n\n{{checklist}}\n\nKind regards,\n{{agent}}" },
    { agencyId: a, kind: "email", name: "Lodgement confirmation", subject: "Your {{visa}} application has been lodged", body: "Hi {{firstName}},\n\nGood news: your application was lodged today. Your TRN is {{trn}}.\n\nKind regards,\n{{agent}}" },
    { agencyId: a, kind: "agreement", name: "Costs agreement", subject: null, body: "Agreement for services and fees under the Code of Conduct for registered migration agents…" },
  ]);
}
