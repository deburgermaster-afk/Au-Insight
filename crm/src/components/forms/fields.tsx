"use client";

import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

export function Row({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn("grid gap-4", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>;
}

export function TextField({ label, hint, className, ...props }: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AreaField({ label, className, ...props }: ComponentProps<typeof Textarea> & { label: string }) {
  const id = props.id ?? props.name;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} {...props} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  placeholder = "Select…",
  className,
  required,
}: {
  label: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={defaultValue} required={required}>
        <SelectTrigger id={name} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
