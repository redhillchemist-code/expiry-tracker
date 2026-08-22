import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatDaysUntil } from "@/lib/expiry";
import { getActiveDepartment } from "@/lib/department";
import type { BatchWithProduct, ExpiryStatus } from "@shared/schema";

type StatusFilter = "all" | ExpiryStatus;

export default function InventoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<BatchWithProduct | null>(null);
  const [editQuantity, setEditQuantity] = useState("1");
  const [editExpiry, setEditExpiry] = useState("");
  const [deleting, setDeleting] = useState<BatchWithProduct | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: batches, isLoading } = useQuery<BatchWithProduct[]>({ queryKey: ["/api/batches"] });

  const counts = useMemo(() => {
    const base = { expired: 0, critical: 0, warning: 0, fresh: 0 };
    for (const b of batches ?? []) base[b.status]++;
    return base;
  }, [batches]);

  const filtered = useMemo(() => {
    let rows = batches ?? [];
    if (statusFilter !== "all") rows = rows.filter((b) => b.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((b) => b.productName.toLowerCase().includes(q) || b.barcode.includes(q));
    }
    return rows;
  }, [batches, statusFilter, search]);

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: number; quantity: number; expiryDate: string }) => {
      await apiRequest("PATCH", `/api/batches/${vars.id}`, { quantity: vars.quantity, expiryDate: vars.expiryDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      setEditing(null);
      toast({ title: "Batch updated" });
    },
    onError: () => toast({ title: "Could not update batch", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/batches/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      setDeleting(null);
      toast({ title: "Batch removed" });
    },
    onError: () => toast({ title: "Could not remove batch", variant: "destructive" }),
  });

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await apiRequest("GET", "/api/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const department = getActiveDepartment();
      const suffix = department ? `-${department}` : "";
      const a = document.createElement("a");
      a.href = url;
      a.download = `expiry-tracker-export${suffix}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Could not export CSV", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }

  function openEdit(b: BatchWithProduct) {
    setEditing(b);
    setEditQuantity(String(b.quantity));
    setEditExpiry(b.expiryDate);
  }

  const filterCards: { key: StatusFilter; label: string; value: number; tone: string }[] = [
    { key: "expired", label: "Expired", value: counts.expired, tone: "text-expiry-expired" },
    { key: "critical", label: "Expiring soon", value: counts.critical, tone: "text-expiry-critical" },
    { key: "warning", label: "Watch", value: counts.warning, tone: "text-expiry-warning" },
    { key: "fresh", label: "Fresh", value: counts.fresh, tone: "text-expiry-fresh" },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">
            Tracked inventory
          </h1>
          <p className="text-sm text-muted-foreground">All scanned batches, sorted by expiry date.</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          data-testid="button-export-csv"
          onClick={handleExport}
          disabled={isExporting}
        >
          <Download className="h-4 w-4" />
          {isExporting ? "Exporting\u2026" : "Export CSV"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {filterCards.map((c) => (
          <Card
            key={c.key}
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(statusFilter === c.key ? "all" : c.key)}
            className={`hover-elevate cursor-pointer ${statusFilter === c.key ? "ring-2 ring-ring" : ""}`}
            data-testid={`card-filter-${c.key}`}
          >
            <CardContent className="p-4">
              <p className={`text-lg font-bold ${c.tone}`}>{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name or barcode"
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="critical">Expiring soon</SelectItem>
            <SelectItem value="warning">Watch</SelectItem>
            <SelectItem value="fresh">Fresh</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Expiry date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Loading inventory&hellip;
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground" data-testid="text-empty-inventory">
                    {batches && batches.length > 0
                      ? "No batches match your filters."
                      : "No batches tracked yet. Scan a product to get started."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((b) => (
                <TableRow key={b.id} data-testid={`row-batch-${b.id}`}>
                  <TableCell className="font-medium">{b.productName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{b.barcode}</TableCell>
                  <TableCell>{b.quantity}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{formatDate(b.expiryDate)}</span>
                      <span className="text-xs text-muted-foreground">{formatDaysUntil(b.daysUntilExpiry)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(b)} data-testid={`button-edit-${b.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(b)} data-testid={`button-delete-${b.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent data-testid="dialog-edit-batch">
          <DialogHeader>
            <DialogTitle>Edit batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{editing?.productName}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-quantity">Quantity</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  min={1}
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  data-testid="input-edit-quantity"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-expiry">Expiry date</Label>
                <Input
                  id="edit-expiry"
                  type="date"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  data-testid="input-edit-expiry"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={() =>
                editing &&
                updateMutation.mutate({ id: editing.id, quantity: Number(editQuantity) || 1, expiryDate: editExpiry })
              }
              disabled={updateMutation.isPending || !editExpiry}
              data-testid="button-save-edit"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-testid="dialog-delete-batch">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deleting?.productName} (qty {deleting?.quantity}, expiring {deleting && formatDate(deleting.expiryDate)}) from
              tracked inventory. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              data-testid="button-confirm-delete"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
