import type { OutputCase } from "./types.js";

export function normalizePhysicalName(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/_+/g, "_").toUpperCase();
}

export function splitPhysicalName(value: string): string[] {
  return normalizePhysicalName(value)
    .split("_")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function camelToSnakePhysical(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("_")) {
    return normalizePhysicalName(trimmed);
  }

  return normalizePhysicalName(
    trimmed
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
  );
}

export function formatPhysicalName(snakeName: string, outputCase: OutputCase = "snake"): string {
  const normalized = normalizePhysicalName(snakeName);
  if (outputCase === "snake") {
    return normalized;
  }

  const words = normalized.split("_").filter(Boolean).map((token) => token.toLowerCase());
  const pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");

  if (outputCase === "upperCamel") {
    return pascal;
  }

  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
