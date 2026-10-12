import { label, type Tone } from "@/components/app/badges";

export const appStages = ["preparing", "submitted", "offer", "conditional", "accepted", "coe", "enrolled"] as const;
export const appTone: Record<string, Tone> = { preparing: "gray", submitted: "blue", offer: "violet", conditional: "amber", accepted: "pink", coe: "blue", enrolled: "green", rejected: "red", withdrawn: "gray" };
export const commissionTone: Record<string, Tone> = { not_due: "gray", claimable: "amber", invoiced: "blue", received: "green", ineligible: "red" };
export const stageLabel = (s: string) => (s === "coe" ? "CoE issued" : label(s));
