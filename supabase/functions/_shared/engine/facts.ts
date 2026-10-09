import { z } from "zod";

/**
 * The typed case file. Every field is optional: a missing fact is never
 * guessed, it makes the dependent criteria evaluate to "unknown" and turns
 * into a question for the user.
 */
export const englishLevels = ["none", "functional", "vocational", "competent", "proficient", "superior"] as const;
export const qualificationLevels = [
  "none",
  "recognised_by_assessing_authority",
  "diploma_or_trade",
  "bachelor_or_masters",
  "doctorate",
] as const;
export const partnerStatuses = [
  "single",
  "partner_citizen_or_pr",
  "partner_skilled",
  "partner_competent_english",
  "partner_other",
] as const;

export const caseFactsSchema = z.object({
  dateOfBirth: z.iso.date().optional(),
  /** Date criteria are assessed at, e.g. invitation date. Defaults to today. */
  assessmentDate: z.iso.date().optional(),
  occupationCode: z.string().optional(),
  /** Lists the nominated occupation is on at the assessment date (from the occupations table). */
  occupationLists: z.array(z.enum(["MLTSSL", "STSOL", "ROL", "CSOL"])).optional(),
  positiveSkillsAssessment: z.boolean().optional(),
  englishLevel: z.enum(englishLevels).optional(),
  /** Skilled employment in the 10 years before the assessment date, in whole years. */
  overseasSkilledYears: z.number().min(0).max(10).optional(),
  australianSkilledYears: z.number().min(0).max(10).optional(),
  highestQualification: z.enum(qualificationLevels).optional(),
  specialistEducation: z.boolean().optional(),
  australianStudyRequirement: z.boolean().optional(),
  professionalYear: z.boolean().optional(),
  credentialledCommunityLanguage: z.boolean().optional(),
  regionalStudy: z.boolean().optional(),
  partnerStatus: z.enum(partnerStatuses).optional(),
  stateNomination: z.boolean().optional(),
  regionalNominationOrSponsorship: z.boolean().optional(),
  invitationReceived: z.boolean().optional(),
  meetsHealth: z.boolean().optional(),
  meetsCharacter: z.boolean().optional(),
  hasCommonwealthDebt: z.boolean().optional(),
});

export type CaseFacts = z.infer<typeof caseFactsSchema>;
export type FactKey = keyof CaseFacts;

/** Plain-language question asked when a fact is missing. */
export const factQuestions: Record<FactKey, string> = {
  dateOfBirth: "What is your date of birth?",
  assessmentDate: "What date should this be assessed at (e.g. your invitation date)?",
  occupationCode: "What is your nominated occupation (ANZSCO code or title)?",
  occupationLists: "Which skilled occupation list is your occupation on?",
  positiveSkillsAssessment: "Do you hold a positive skills assessment for your nominated occupation?",
  englishLevel: "What is your English level from a recognised test (competent, proficient or superior)?",
  overseasSkilledYears: "How many years of skilled employment outside Australia in the last 10 years?",
  australianSkilledYears: "How many years of skilled employment in Australia in the last 10 years?",
  highestQualification: "What is your highest qualification?",
  specialistEducation: "Do you hold an Australian Masters by research or Doctorate in a STEM field?",
  australianStudyRequirement: "Have you met the Australian study requirement (at least 2 academic years in Australia)?",
  professionalYear: "Have you completed a Professional Year in Australia?",
  credentialledCommunityLanguage: "Do you hold a NAATI credentialled community language qualification?",
  regionalStudy: "Did you study in regional Australia?",
  partnerStatus: "What is your partner situation?",
  stateNomination: "Have you been nominated by a state or territory government (subclass 190)?",
  regionalNominationOrSponsorship: "Do you have a state nomination or eligible family sponsorship for regional (subclass 491)?",
  invitationReceived: "Have you received an invitation to apply?",
  meetsHealth: "Are you free of any known health condition that could affect the health requirement?",
  meetsCharacter: "Are you free of anything (convictions, past visa issues) that could affect the character requirement?",
  hasCommonwealthDebt: "Do you owe any outstanding debts to the Australian Government?",
};

export function ageOn(dateOfBirth: string, on: string): number {
  const dob = new Date(dateOfBirth + "T00:00:00Z");
  const at = new Date(on + "T00:00:00Z");
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < dob.getUTCMonth() ||
    (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
