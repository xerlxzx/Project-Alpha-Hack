"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TextOption } from "@/lib/preference-options";

/**
 * Dropdown built on Base UI Select, styled to match the text Input. Values are
 * plain strings; the empty-string option is the neutral default and saves NULL.
 */
export function SelectField({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: TextOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? options[0]?.label;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-muted-foreground">{label}</label>
      <Select.Root value={value} onValueChange={(next) => onSelect(next ?? "")}>
        <Select.Trigger
          className={cn(
            "flex h-12 w-full items-center justify-between gap-2 rounded-full border border-input bg-transparent px-5 text-base transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring dark:bg-input/30"
          )}
        >
          <Select.Value>{(v: string) => labelFor(v)}</Select.Value>
          <Select.Icon>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="z-50 outline-none" sideOffset={6} alignItemWithTrigger={false}>
            <Select.Popup className="max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-black/30 outline-none">
              {options.map((opt) => (
                <Select.Item
                  key={opt.value || "none"}
                  value={opt.value}
                  className={cn(
                    "flex cursor-default select-none items-center justify-between gap-3 rounded-full py-2.5 pl-4 pr-3 text-base outline-none",
                    "data-[highlighted]:bg-muted data-[selected]:font-medium"
                  )}
                >
                  <Select.ItemText>{opt.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check className="size-4 text-[var(--accent)]" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
