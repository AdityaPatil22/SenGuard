import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function riskColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score <= 25) return "text-success";
  if (score <= 50) return "text-warning";
  if (score <= 75) return "text-orange-500";
  return "text-destructive";
}

export function riskLabel(score: number | null) {
  if (score == null) return "Not scored";
  if (score <= 25) return "Low Risk";
  if (score <= 50) return "Medium Risk";
  if (score <= 75) return "High Risk";
  return "Critical Risk";
}

export function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-5 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-6 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$2</li>')
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/\n{2,}/g, '<div class="h-2"></div>')
    .replace(/\n/g, "<br>");
}
