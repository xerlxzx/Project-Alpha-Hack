"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { spring } from "@/components/motion/tokens";

export function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          )}
        >
          {i <= step && (
            <motion.div
              layout
              className="h-full rounded-full bg-[var(--accent)]"
              initial={{ width: i === step ? "0%" : "100%" }}
              animate={{ width: "100%" }}
              transition={spring.gentle}
            />
          )}
        </div>
      ))}
    </div>
  );
}
