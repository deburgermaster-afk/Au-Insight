import { Fragment, type ReactNode } from "react";
import { MERGE_FIELDS } from "@/lib/contracts";

const labels = new Set(MERGE_FIELDS.map((f) => f.label));

/** Inline formatting: **bold**, {{merge fields}} and [unfilled blanks] highlighted. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\{\{\s*[\w.]+\s*\}\}|\[[^\]\n]{3,60}\])/g).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\{\{.+\}\}$/.test(part)) return <code key={i} className="rounded bg-sky-500/12 px-1 py-px text-[0.92em] text-sky-600 dark:text-sky-400">{part}</code>;
    if (/^\[.+\]$/.test(part) && labels.has(part.slice(1, -1))) return <mark key={i} className="rounded bg-amber-500/20 px-1 text-amber-700 dark:text-amber-300">{part}</mark>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Renders contract Markdown (headings, paragraphs, bullet lists) as readable text. */
export function ContractText({ body, className }: { body: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-5 list-disc space-y-1">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*[-*] /.test(line)) {
      list.push(line.replace(/^\s*[-*] /, ""));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (line.startsWith("# ")) blocks.push(<h1 key={blocks.length} className="text-xl font-semibold tracking-tight">{inline(line.slice(2))}</h1>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={blocks.length} className="pt-2 text-[15px] font-semibold">{inline(line.slice(3))}</h2>);
    else if (line.startsWith("### ")) blocks.push(<h3 key={blocks.length} className="pt-1 font-medium">{inline(line.slice(4))}</h3>);
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className={className ?? "grid gap-2.5 text-[13.5px] leading-relaxed"}>{blocks}</div>;
}
