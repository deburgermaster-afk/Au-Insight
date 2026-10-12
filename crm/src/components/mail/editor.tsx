"use client";

import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Unlink,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const fonts = [
  ["Default", ""],
  ["Sans", "Inter, Helvetica, Arial, sans-serif"],
  ["Serif", "Georgia, 'Times New Roman', serif"],
  ["Mono", "ui-monospace, Menlo, monospace"],
  ["Arial", "Arial, Helvetica, sans-serif"],
  ["Verdana", "Verdana, Geneva, sans-serif"],
  ["Trebuchet", "'Trebuchet MS', sans-serif"],
] as const;
const sizes = ["12px", "14px", "15px", "16px", "18px", "22px", "28px"];
const colors = ["#18181b", "#52525b", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0284c7", "#4f46e5", "#c026d3"];

function Tool({ on, onClick, label, children }: { on?: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground [&_svg]:size-3.5", on && "bg-muted text-foreground")}
    >
      {children}
    </button>
  );
}

/** A rich-text email editor: fonts, sizes, colours, lists, alignment, links. */
export function MailEditor({ initial, onChange, placeholder = "Write your message…", minHeight = 220 }: { initial?: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number }) {
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: initial ?? "",
    editorProps: { attributes: { class: "mail-prose outline-none" } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  const e = editor;
  const st = e
    ? {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        quote: e.isActive("blockquote"),
        link: e.isActive("link"),
        font: (e.getAttributes("textStyle").fontFamily as string) ?? "",
        size: (e.getAttributes("textStyle").fontSize as string) ?? "",
        align: ["left", "center", "right"].find((a) => e.isActive({ textAlign: a })) ?? "left",
      }
    : null;
  const [href, setHref] = useState("");
  if (!editor || !st) return <div className="rounded-lg border" style={{ minHeight }} />;
  const c = () => editor.chain().focus();
  return (
    <div className="overflow-hidden rounded-lg border bg-background focus-within:ring-3 focus-within:ring-ring/30">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        <select
          value={fonts.find(([, f]) => f === st.font)?.[1] ?? ""}
          onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}
          className="h-7 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:bg-muted"
          aria-label="Font"
        >
          {fonts.map(([n, f]) => (
            <option key={n} value={f}>
              {n}
            </option>
          ))}
        </select>
        <select value={st.size} onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())} className="h-7 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:bg-muted" aria-label="Size">
          <option value="">Size</option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s.replace("px", "")}
            </option>
          ))}
        </select>
        <span className="mx-1 h-4 w-px bg-border" />
        <Tool label="Bold" on={st.bold} onClick={() => c().toggleBold().run()}>
          <Bold />
        </Tool>
        <Tool label="Italic" on={st.italic} onClick={() => c().toggleItalic().run()}>
          <Italic />
        </Tool>
        <Tool label="Underline" on={st.underline} onClick={() => c().toggleUnderline().run()}>
          <Underline />
        </Tool>
        <Tool label="Strikethrough" on={st.strike} onClick={() => c().toggleStrike().run()}>
          <Strikethrough />
        </Tool>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title="Text colour" className="grid size-7 place-items-center rounded-md hover:bg-muted" onMouseDown={(e) => e.preventDefault()}>
              <span className="size-3.5 rounded-full border bg-[conic-gradient(#dc2626,#ca8a04,#16a34a,#0284c7,#c026d3,#dc2626)]" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-auto gap-1.5 p-2">
            {colors.map((col) => (
              <button key={col} type="button" className="size-6 rounded-full border" style={{ background: col }} onClick={() => c().setColor(col).run()} aria-label={col} />
            ))}
            <button type="button" className="ml-1 text-xs text-muted-foreground" onClick={() => c().unsetColor().run()}>
              Reset
            </button>
          </PopoverContent>
        </Popover>
        <span className="mx-1 h-4 w-px bg-border" />
        <Tool label="Bulleted list" on={st.bullet} onClick={() => c().toggleBulletList().run()}>
          <List />
        </Tool>
        <Tool label="Numbered list" on={st.ordered} onClick={() => c().toggleOrderedList().run()}>
          <ListOrdered />
        </Tool>
        <Tool label="Quote" on={st.quote} onClick={() => c().toggleBlockquote().run()}>
          <Quote />
        </Tool>
        <Tool label="Align left" on={st.align === "left"} onClick={() => c().setTextAlign("left").run()}>
          <AlignLeft />
        </Tool>
        <Tool label="Centre" on={st.align === "center"} onClick={() => c().setTextAlign("center").run()}>
          <AlignCenter />
        </Tool>
        <Tool label="Align right" on={st.align === "right"} onClick={() => c().setTextAlign("right").run()}>
          <AlignRight />
        </Tool>
        <span className="mx-1 h-4 w-px bg-border" />
        <Popover onOpenChange={(o) => o && setHref((editor.getAttributes("link").href as string) ?? "")}>
          <PopoverTrigger asChild>
            <button type="button" title="Link" onMouseDown={(e) => e.preventDefault()} className={cn("grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted [&_svg]:size-3.5", st.link && "bg-muted text-foreground")}>
              <Link2 />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-80 gap-2 p-2">
            <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://immi.homeaffairs.gov.au/…" className="h-8" />
            <Button size="sm" onClick={() => (href ? c().extendMarkRange("link").setLink({ href }).run() : c().unsetLink().run())}>
              Apply
            </Button>
          </PopoverContent>
        </Popover>
        {st.link ? (
          <Tool label="Remove link" onClick={() => c().unsetLink().run()}>
            <Unlink />
          </Tool>
        ) : null}
        <Tool label="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting />
        </Tool>
      </div>
      <EditorContent editor={editor} className="max-h-[50vh] overflow-y-auto px-4 py-3 text-sm" style={{ minHeight }} />
    </div>
  );
}
