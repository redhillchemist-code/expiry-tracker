import { useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DepartmentPicker } from "@/components/department-picker";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import ScannerPage from "@/pages/scanner";
import InventoryPage from "@/pages/inventory";
import ProductsPage from "@/pages/products";
import SettingsPage from "@/pages/settings";
import { getActiveDepartment, setActiveDepartment, clearActiveDepartment, departmentLabel, type Department } from "@/lib/department";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={ScannerPage} />
      <Route path="/inventory" component={InventoryPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  const [department, setDepartment] = useState<Department | null>(() => getActiveDepartment());

  const handleSelectDepartment = (dept: Department) => {
    setActiveDepartment(dept);
    setDepartment(dept);
  };

  const handleSwitchDepartment = () => {
    clearActiveDepartment();
    queryClient.clear();
    setDepartment(null);
  };

  if (!department) {
    return (
      <ThemeProvider>
        <DepartmentPicker onSelect={handleSelectDepartment} />
      </ThemeProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <SidebarProvider style={style}>
              <div className="flex h-screen w-full overflow-hidden">
                <AppSidebar department={department} onSwitchDepartment={handleSwitchDepartment} />
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
                    <div className="flex items-center gap-2">
                      <SidebarTrigger data-testid="button-sidebar-toggle" />
                      <Badge variant="secondary" data-testid="badge-active-department">
                        {departmentLabel(department)}
                      </Badge>
                    </div>
                    <ThemeToggle />
                  </header>
                  <main className="flex-1 overflow-y-auto">
                    <AppRouter />
                  </main>
                </div>
              </div>
            </SidebarProvider>
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
