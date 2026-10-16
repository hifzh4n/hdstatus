import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button className={cn("rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40", variant === "primary" && "bg-teal-300 text-slate-950 hover:bg-teal-200", variant === "secondary" && "border border-slate-700 bg-slate-900 hover:border-slate-500", variant === "ghost" && "text-slate-300 hover:bg-slate-800", className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl shadow-black/10", className)} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", tone === "neutral" && "border-slate-700 bg-slate-900 text-slate-300", tone === "good" && "border-emerald-800 bg-emerald-950 text-emerald-300", tone === "warn" && "border-amber-800 bg-amber-950 text-amber-300", tone === "bad" && "border-red-900 bg-red-950 text-red-300")}>{children}</span>;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-teal-400", className)} {...props} />;
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400", className)} {...props} />;
}
