import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export { getFullImageUrl } from "@/lib/api-base"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
