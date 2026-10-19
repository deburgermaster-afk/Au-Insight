// Sponsor notification events, shared by the employer page and the server.

export const SPONSOR_EVENTS = {
  worker_ceased: { label: "Sponsored worker stopped working for you", needsWorker: true },
  worker_not_started: { label: "Sponsored worker didn't start work", needsWorker: true },
  duties_changed: { label: "Worker's duties or position changed", needsWorker: true },
  business_details: { label: "Business name, address or contact changed", needsWorker: false },
  ownership: { label: "Change of ownership, partners or legal entity", needsWorker: false },
  ceased_trading: { label: "Business stopped trading or became insolvent", needsWorker: false },
  other: { label: "Other notifiable change", needsWorker: false },
} as const;

export type SponsorEventKind = keyof typeof SPONSOR_EVENTS;
export const eventLabel = (k: string) => SPONSOR_EVENTS[k as SponsorEventKind]?.label ?? k;

/** Home Affairs must be told within 28 days of the event. */
export function notifyByFor(occurredOn: string) {
  const d = new Date(`${occurredOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 28);
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_BIRTHDAY_MESSAGE = "Happy birthday, {firstName}! Everyone at {agency} wishes you a wonderful day and a great year ahead.";
