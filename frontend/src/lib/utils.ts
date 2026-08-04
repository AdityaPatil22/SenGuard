import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function riskColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score <= 25) return "text-success";
  if (score <= 50) return "text-warning";
  if (score <= 75) return "text-orange-500";
  return "text-destructive";
}

export function riskLabel(score: number | null | undefined): string {
  if (score == null) return "N/A";
  if (score <= 25) return "Low Risk";
  if (score <= 50) return "Medium Risk";
  if (score <= 75) return "High Risk";
  return "Critical Risk";
}
