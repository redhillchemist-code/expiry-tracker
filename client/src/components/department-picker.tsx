import { Store, Pill } from "lucide-react";
import { DEPARTMENTS, type Department } from "@/lib/department";
import { Card } from "@/components/ui/card";

const ICONS: Record<Department, typeof Store> = {
  "front-shop": Store,
  dispensary: Pill,
};

export function DepartmentPicker({ onSelect }: { onSelect: (department: Department) => void }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-label="ExpiryScan logo" className="mb-3 text-primary">
            <rect x="2" y="6" width="4" height="20" rx="1" fill="currentColor" />
            <rect x="8" y="6" width="2" height="20" rx="1" fill="currentColor" />
            <rect x="12" y="6" width="4" height="20" rx="1" fill="currentColor" />
            <rect x="18" y="6" width="2" height="20" rx="1" fill="currentColor" />
            <rect x="22" y="6" width="3" height="20" rx="1" fill="currentColor" />
            <path d="M26 3 L30 3 L30 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M6 29 L2 29 L2 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <h1 className="text-xl font-bold text-foreground">ExpiryScan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Which department are you working in?</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {DEPARTMENTS.map((dept) => {
            const Icon = ICONS[dept.id];
            return (
              <Card
                key={dept.id}
                role="button"
                tabIndex={0}
                data-testid={`button-select-department-${dept.id}`}
                onClick={() => onSelect(dept.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(dept.id)}
                className="group flex cursor-pointer flex-col items-start gap-3 border-border p-6 transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">{dept.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{dept.description}</p>
                </div>
              </Card>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Each department keeps its own separate product list and expiry tracking. You can switch anytime from the sidebar.
        </p>
      </div>
    </div>
  );
}
