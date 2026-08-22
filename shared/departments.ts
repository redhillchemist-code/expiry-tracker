// Single source of truth for the store's departments. Each department gets its own
// fully isolated database (products, batches, and settings are never shared across departments).
export const DEPARTMENT_IDS = ["front-shop", "dispensary"] as const;
export type Department = (typeof DEPARTMENT_IDS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  "front-shop": "Front Shop",
  dispensary: "Dispensary",
};

export const DEPARTMENT_DESCRIPTIONS: Record<Department, string> = {
  "front-shop": "General retail, OTC products, and everyday front-of-store stock.",
  dispensary: "Prescription medicines and dispensary-only stock.",
};

export const DEFAULT_DEPARTMENT: Department = "front-shop";

export function isDepartment(value: unknown): value is Department {
  return typeof value === "string" && (DEPARTMENT_IDS as readonly string[]).includes(value);
}
