// Immigration news for agents: changes in force and announced, with where each came from. Curated
// from Home Affairs announcements and practitioner summaries; check the Department's own page before
// advising a client, especially for "announced" items that don't yet have a legal instrument.

export type NewsItem = {
  id: string;
  date: string; // when it was announced or took effect (YYYY-MM-DD)
  title: string;
  status: "in-force" | "announced" | "upcoming";
  effective?: string;
  tags: string[]; // visa codes or topics
  summary: string;
  points: string[];
  sources: { label: string; url: string }[];
};

export const NEWS_UPDATED = "2026-10-18";

export const news: NewsItem[] = [
  {
    id: "student-oct-2026",
    date: "2026-10-02",
    title: "New student visa rules: family members and onshore applications",
    status: "in-force",
    effective: "2026-10-02",
    tags: ["500", "590", "417", "462", "Student"],
    summary: "Applications for Student (500) and Student Guardian (590) visas made on or after 2 October 2026 fall under new eligibility, in-country and family-member rules.",
    points: [
      "Most new student visa applicants can no longer include a partner or children; exemptions include PhD students and eligible students from Pacific and ASEAN countries.",
      "Student visa holders can't add family members after the visa is granted.",
      "Working Holiday Maker (417/462) holders must apply for a student visa from outside Australia: an onshore application is invalid and gives no bridging visa.",
      "Applies to applications made on or after 2 October 2026; earlier applications continue under the old rules.",
    ],
    sources: [
      { label: "Australia Migrate: student visa changes October 2026", url: "https://www.australiamigrate.com/student-visa-changes-october-2026-what-the-new-subclass-500-rules-mean-for-you/" },
      { label: "OneU: WHM to student visa now offshore only", url: "https://www.oneuedu.com/en-US/visa/policy-updates/working-holiday-to-student-visa-offshore-only" },
    ],
  },
  {
    id: "burke-sep-2026",
    date: "2026-09-17",
    title: "Minister Burke's migration package: students, graduates, WHM, visitors, skilled",
    status: "announced",
    tags: ["485", "417", "462", "600", "189", "190", "491", "Agents"],
    summary: "A package of measures across student, graduate, working holiday, visitor, skilled, overstayer and migration agent settings, to be introduced progressively over the next 12 months.",
    points: [
      "Temporary Graduate (485): restrictions on including family members announced. No start date or instrument yet.",
      "Working Holiday Maker: a ballot for places announced.",
      "Visitor visas: wider use of a 'no further stay' condition announced.",
      "Skilled: changes to the points test, including how trade qualifications score, announced.",
      "Planning: net overseas migration targets of about 245,000, moving to 225,000.",
      "The Expression of Interest model for demand-driven visas won't go ahead without legislation.",
    ],
    sources: [
      { label: "Pathway to Aus: every change in the 17 Sept announcement", url: "https://pathwaytoaus.com/general/tony-burkes-17-sept-2026-announcement-explaining-every-australia-migration-change/" },
      { label: "This is Australia: migration program changes", url: "https://www.thisisaustralia.com/news/australian-government-announces-migration-program-changes/" },
    ],
  },
  {
    id: "directions-sep-2026",
    date: "2026-09-19",
    title: "New processing priorities for skilled visas (Ministerial Directions)",
    status: "in-force",
    effective: "2026-09-19",
    tags: ["482", "186", "494", "189", "190", "491", "Processing"],
    summary: "New Ministerial Directions set the order in which skilled and employer-sponsored applications are processed from 19 September 2026.",
    points: [
      "Applications are processed in the priority order set by the Directions rather than lodgement order.",
      "Expect longer waits for lower-priority occupations; check where a client's application sits before quoting a timeframe.",
    ],
    sources: [{ label: "Migratio: Australia migration changes 2026", url: "https://migratio.com.au/blog/australia-migration-changes-2026" }],
  },
  {
    id: "child-lin-2026",
    date: "2026-09-02",
    title: "New lodgement instrument for Child visas (LIN 26/081)",
    status: "in-force",
    effective: "2026-09-02",
    tags: ["101", "802", "102", "445", "Family"],
    summary: "A new legislative instrument changes how Child visa applications are lodged from 2 September 2026.",
    points: ["Check the approved form and lodgement method before lodging any Child visa from 2 September 2026."],
    sources: [{ label: "One Planet Migration Law", url: "https://oneplanetmigrationlaw.com.au/?p=4246" }],
  },
  {
    id: "vac-jul-2026",
    date: "2026-07-01",
    title: "Visa application charges up about 25% for most visas",
    status: "in-force",
    effective: "2026-07-01",
    tags: ["Fees"],
    summary: "Visa application charges rose by about 25% for most visas on 1 July 2026, the start of the 2026–27 program year.",
    points: [
      "Re-quote fee estimates and costs agreements sent before 1 July 2026 if the application hasn't been lodged.",
      "Check the Department's fee estimator for the exact charge for each applicant.",
    ],
    sources: [{ label: "Migratio: Australia migration changes 2026", url: "https://migratio.com.au/blog/australia-migration-changes-2026" }],
  },
  {
    id: "rounds-2026-27",
    date: "2026-06-04",
    title: "Last SkillSelect round: 10,000 subclass 189 invitations (4 June 2026)",
    status: "upcoming",
    tags: ["189", "491", "SkillSelect"],
    summary: "The latest published round invited 10,000 Skilled Independent (189) applicants, with occupation cut-offs from 65 to 100 points. No 2026–27 round has been published yet.",
    points: [
      "There are no fixed dates for invitation rounds; the first 2026–27 189 round is widely expected between August and November.",
      "Meeting 65 points doesn't guarantee an invitation: see the cut-off for the client's occupation under Invitation rounds.",
    ],
    sources: [
      { label: "Magpie: skilled visa invitation rounds 2026–27 guide", url: "https://magpieconsultants.com.au/skilled-visa-invitation-rounds-2026-27-guide/" },
      { label: "Asia Pacific Group: latest 189 and 491 round analysis", url: "https://asiapacificgroup.com/blog/latest-subclass-189-and-491-invitation-round-analysis/" },
    ],
  },
];

/** News that touches a visa code (or one of its topics), newest first. */
export const newsFor = (code: string) => news.filter((n) => n.tags.includes(code));
