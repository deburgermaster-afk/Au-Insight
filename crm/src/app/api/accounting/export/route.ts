import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { invoicesCsv, myobReceiptsFile, myobSalesFile } from "@/lib/accounting";
import { actionCtx } from "@/lib/session";

// Downloads for the books: MYOB AccountRight import files (service sales, customer payments) or a plain CSV.
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Sign in first.", { status: 401 });
  const ctx = await actionCtx();
  if (!ctx.caps.includes("billing")) return new Response("Your role can't export invoices.", { status: 403 });
  const q = new URL(req.url).searchParams;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  if (!iso.test(from) || !iso.test(to) || from > to) return new Response("Choose a valid date range.", { status: 400 });
  const kind = q.get("kind");
  const f = kind === "myob-sales" ? await myobSalesFile(ctx.agencyId, from, to) : kind === "myob-receipts" ? await myobReceiptsFile(ctx.agencyId, from, to) : kind === "csv" ? await invoicesCsv(ctx.agencyId, from, to) : null;
  if (!f) return new Response("Unknown export.", { status: 400 });
  const csv = kind === "csv";
  const name = `${kind}-${from}-to-${to}.${csv ? "csv" : "txt"}`;
  return new Response((csv ? "﻿" : "") + f.body, {
    headers: { "content-type": csv ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
