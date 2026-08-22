import {
  DEPARTMENT_IDS,
  DEPARTMENT_LABELS,
  DEPARTMENT_DESCRIPTIONS,
  isDepartment,
  type Department,
} from "@shared/departments";

export type { Department };

export const DEPARTMENTS = DEPARTMENT_IDS.map((id) => ({
  id,
  label: DEPARTMENT_LABELS[id],
  description: DEPARTMENT_DESCRIPTIONS[id],
}));

// Held in memory only (not localStorage/sessionStorage) so a fresh launch — a new tab or a
// full reload — always asks which department to work in, while navigating between pages
// within the same running app doesn't re-prompt.
let activeDepartment: Department | null = null;

export function getActiveDepartment(): Department | null {
  return isDepartment(activeDepartment) ? activeDepartment : null;
}

export function setActiveDepartment(department: Department) {
  activeDepartment = department;
}

export function clearActiveDepartment() {
  activeDepartment = null;
}

export function departmentLabel(department: Department): string {
  return DEPARTMENT_LABELS[department] ?? department;
}
