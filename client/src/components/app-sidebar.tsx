import { ScanBarcode, LayoutList, PackageSearch, SlidersHorizontal, ArrowLeftRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { departmentLabel, type Department } from "@/lib/department";

const items = [
  { title: "Scan", url: "/", icon: ScanBarcode, testId: "link-nav-scan" },
  { title: "Inventory", url: "/inventory", icon: LayoutList, testId: "link-nav-inventory" },
  { title: "Products", url: "/products", icon: PackageSearch, testId: "link-nav-products" },
  { title: "Settings", url: "/settings", icon: SlidersHorizontal, testId: "link-nav-settings" },
];

export function AppSidebar({
  department,
  onSwitchDepartment,
}: {
  department: Department;
  onSwitchDepartment: () => void;
}) {
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 px-1">
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            aria-label="ExpiryScan logo"
            className="text-sidebar-primary shrink-0"
          >
            <rect x="2" y="6" width="4" height="20" rx="1" fill="currentColor" />
            <rect x="8" y="6" width="2" height="20" rx="1" fill="currentColor" />
            <rect x="12" y="6" width="4" height="20" rx="1" fill="currentColor" />
            <rect x="18" y="6" width="2" height="20" rx="1" fill="currentColor" />
            <rect x="22" y="6" width="3" height="20" rx="1" fill="currentColor" />
            <path d="M26 3 L30 3 L30 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M6 29 L2 29 L2 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-sidebar-foreground">ExpiryScan</span>
            <span className="text-xs text-muted-foreground">Expiry tracker</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} data-testid={item.testId}>
                      <Link href={item.url} onClick={() => isMobile && setOpenMobile(false)}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2 rounded-md border border-sidebar-border px-2 py-1.5">
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-medium text-sidebar-foreground">{departmentLabel(department)}</span>
            <span className="text-[11px] text-muted-foreground">Pinnacle Pharmacy</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onSwitchDepartment}
            title="Switch department"
            data-testid="button-switch-department"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
