// Passport machine-readable zone (ICAO 9303, TD3: two lines of 44 characters). The check digits let
// us confirm that what a model read from a photo is right, character for character.

const VAL = (c: string) => (c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55);
export function checkDigit(s: string) {
  const w = [7, 3, 1];
  return String([...s].reduce((t, c, i) => t + VAL(c) * w[i % 3], 0) % 10);
}

export type Mrz = {
  surname: string;
  givenNames: string;
  passportNumber: string;
  nationality: string;
  issuingCountry: string;
  dateOfBirth: string | null;
  sex: "M" | "F" | "X";
  expiry: string | null;
  checks: { number: boolean; birth: boolean; expiry: boolean; composite: boolean };
};

const ymd = (yymmdd: string, future: boolean) => {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const now = new Date().getFullYear() % 100;
  // Birth dates are in the past; expiry dates up to ~20 years ahead.
  const century = future ? (yy < now + 30 ? 2000 : 1900) : yy > now ? 1900 : 2000;
  return `${century + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
};

/** Parses the two MRZ lines; returns null when they aren't a TD3 passport MRZ. */
export function parseMrz(line1: string, line2: string): Mrz | null {
  const a = line1.replace(/\s/g, "").toUpperCase();
  const b = line2.replace(/\s/g, "").toUpperCase();
  if (a.length !== 44 || b.length !== 44 || a[0] !== "P") return null;
  const names = a.slice(5).split("<<");
  const number = b.slice(0, 9);
  const composite = b.slice(0, 10) + b.slice(13, 20) + b.slice(21, 43);
  const sex = b[20] === "M" || b[20] === "F" ? b[20] : "X";
  return {
    surname: names[0].replace(/</g, " ").trim(),
    givenNames: (names.slice(1).join(" ") || "").replace(/</g, " ").replace(/\s+/g, " ").trim(),
    passportNumber: number.replace(/</g, ""),
    nationality: b.slice(10, 13).replace(/</g, ""),
    issuingCountry: a.slice(2, 5).replace(/</g, ""),
    dateOfBirth: ymd(b.slice(13, 19), false),
    sex,
    expiry: ymd(b.slice(21, 27), true),
    checks: { number: checkDigit(number) === b[9], birth: checkDigit(b.slice(13, 19)) === b[19], expiry: checkDigit(b.slice(21, 27)) === b[27], composite: checkDigit(composite) === b[43] },
  };
}

export const mrzValid = (m: Mrz) => m.checks.number && m.checks.birth && m.checks.expiry && m.checks.composite;
