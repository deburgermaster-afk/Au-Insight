import { stages } from "@/lib/visas";

/** What each stage means, in the client's words. */
export const stageInfo: Record<string, string> = {
  enquiry: "We've received your enquiry and will be in touch.",
  consultation: "We're assessing your options in a consultation.",
  engaged: "You've engaged us and we're planning your application.",
  documents: "We're collecting your documents. Upload anything outstanding below.",
  ready: "Your application is being checked and finalised for lodgement.",
  lodged: "Lodged with the Department of Home Affairs and awaiting assessment.",
  rfi: "The Department has asked for more information. We'll guide you through it.",
  decision: "A decision has been made on your application.",
  closed: "This case is closed.",
};

const track = stages.filter((s) => s.key !== "closed");
export const stageIndex = (k: string) => Math.max(0, track.findIndex((s) => s.key === k));
export const stageLabel = (k: string) => stages.find((s) => s.key === k)?.label ?? k;
export const stageProgress = (k: string) => (k === "closed" ? 100 : Math.round(((stageIndex(k) + 1) / track.length) * 100));
export { track };
