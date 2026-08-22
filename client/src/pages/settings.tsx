import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Mail, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { departmentLabel, getActiveDepartment } from "@/lib/department";
import type { Settings } from "@shared/schema";

function isValidEmailOrEmpty(value: string): boolean {
  return value.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const department = getActiveDepartment();

  const [warningDays, setWarningDays] = useState("90");
  const [criticalDays, setCriticalDays] = useState("30");
  const [reportEmail1, setReportEmail1] = useState("");
  const [reportEmail2, setReportEmail2] = useState("");
  const [reportSendDay, setReportSendDay] = useState("1");

  useEffect(() => {
    if (settings) {
      setWarningDays(String(settings.warningDays));
      setCriticalDays(String(settings.criticalDays));
      setReportEmail1(settings.reportEmail1 ?? "");
      setReportEmail2(settings.reportEmail2 ?? "");
      setReportSendDay(String(settings.reportSendDay ?? 1));
    }
  }, [settings]);

  const emailsValid = isValidEmailOrEmpty(reportEmail1) && isValidEmailOrEmpty(reportEmail2);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/settings", {
        warningDays: Number(warningDays) || 90,
        criticalDays: Number(criticalDays) || 30,
        reportEmail1: reportEmail1.trim(),
        reportEmail2: reportEmail2.trim(),
        reportSendDay: Number(reportSendDay) || 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      toast({ title: "Settings updated" });
    },
    onError: () => toast({ title: "Could not save settings", variant: "destructive" }),
  });

  const clearInventoryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/batches");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      toast({ title: "Inventory cleared", description: "All scanned batches were removed. Your product list is unchanged." });
    },
    onError: () => toast({ title: "Could not clear inventory", variant: "destructive" }),
  });

  const clearProductsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/products");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      toast({ title: "Product list cleared", description: "All products and their batches were removed." });
    },
    onError: () => toast({ title: "Could not clear product list", variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          {department
            ? `Expiry thresholds and monthly report delivery for ${departmentLabel(department)}. Each department is configured separately.`
            : "Expiry thresholds and monthly report delivery for this department."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SlidersHorizontal className="h-4 w-4" />
            Thresholds
          </CardTitle>
          <CardDescription>Applies to every tracked batch across the inventory.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="warning-days">
              Watch threshold <span className="text-muted-foreground">(days before expiry)</span>
            </Label>
            <Input
              id="warning-days"
              type="number"
              min={1}
              value={warningDays}
              onChange={(e) => setWarningDays(e.target.value)}
              data-testid="input-warning-days"
            />
            <div className="text-xs text-muted-foreground">
              Batches expiring within this many days show a <StatusBadge status="warning" className="ml-1" /> badge.
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="critical-days">
              Expiring soon threshold <span className="text-muted-foreground">(days before expiry)</span>
            </Label>
            <Input
              id="critical-days"
              type="number"
              min={1}
              value={criticalDays}
              onChange={(e) => setCriticalDays(e.target.value)}
              data-testid="input-critical-days"
            />
            <div className="text-xs text-muted-foreground">
              Batches expiring within this many days show a <StatusBadge status="critical" className="ml-1" /> badge.
              Anything past its expiry date always shows <StatusBadge status="expired" className="ml-1" />, and
              everything else shows <StatusBadge status="fresh" className="ml-1" />.
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !emailsValid}
            data-testid="button-save-settings"
          >
            Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-4 w-4" />
            Monthly email report
          </CardTitle>
          <CardDescription>
            {department
              ? `Sends a separate monthly report for ${departmentLabel(department)} only, to the addresses below.`
              : "Sends a separate monthly report for this department only, to the addresses below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="report-email-1">
              Email address 1 <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="report-email-1"
              type="email"
              placeholder="name@example.com"
              value={reportEmail1}
              onChange={(e) => setReportEmail1(e.target.value)}
              data-testid="input-report-email-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-email-2">
              Email address 2 <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="report-email-2"
              type="email"
              placeholder="name@example.com"
              value={reportEmail2}
              onChange={(e) => setReportEmail2(e.target.value)}
              data-testid="input-report-email-2"
            />
            {!emailsValid && (
              <div className="text-xs text-destructive">Enter a valid email address, or leave the field blank.</div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-send-day">Send on day of month</Label>
            <Select value={reportSendDay} onValueChange={setReportSendDay}>
              <SelectTrigger id="report-send-day" data-testid="select-report-send-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {ordinal(day)} of the month
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Capped at 28 so it falls in every month, including February.
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !emailsValid}
            data-testid="button-save-report-settings"
          >
            Save report settings
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <TriangleAlert className="h-4 w-4" />
            Danger zone
          </CardTitle>
          <CardDescription>
            {department
              ? `Permanently erase data for ${departmentLabel(department)} only. The other department is never affected.`
              : "Permanently erase data for this department only. The other department is never affected."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">Clear inventory</div>
              <div className="text-xs text-muted-foreground">
                Removes every scanned batch and expiry date. Keeps your product/barcode list intact.
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className={buttonVariants({ variant: "destructive" })}
                  data-testid="button-clear-inventory"
                >
                  Clear inventory
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all inventory?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every scanned batch and expiry date for{" "}
                    {department ? departmentLabel(department) : "this department"}. Your product/barcode list will
                    stay in place, so you can start re-scanning right away. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-clear-inventory">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: "destructive" })}
                    onClick={() => clearInventoryMutation.mutate()}
                    data-testid="button-confirm-clear-inventory"
                  >
                    Clear inventory
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">Clear product list</div>
              <div className="text-xs text-muted-foreground">
                Removes every product/barcode AND every batch that references it — a full reset. You'll need to
                re-import or re-add products afterward.
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className={buttonVariants({ variant: "destructive" })}
                  data-testid="button-clear-products"
                >
                  Clear product list
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear the entire product list?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every product/barcode and every batch for{" "}
                    {department ? departmentLabel(department) : "this department"} — a full reset. This cannot be
                    undone, and you'll need to re-import or re-add products afterward.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-clear-products">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: "destructive" })}
                    onClick={() => clearProductsMutation.mutate()}
                    data-testid="button-confirm-clear-products"
                  >
                    Clear product list
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
