import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseProductCsv, type ParsedProductRow } from "@/lib/csv";
import type { Product } from "@shared/schema";

export default function ProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [importPreview, setImportPreview] = useState<ParsedProductRow[] | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newBarcode, setNewBarcode] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<Product | null>(null);

  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  const filtered = useMemo(() => {
    if (!search.trim()) return products ?? [];
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q));
  }, [products, search]);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseProductCsv(text);
      setImportFileName(file.name);
      setImportPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const importMutation = useMutation({
    mutationFn: async (rows: ParsedProductRow[]) => {
      const res = await apiRequest("POST", "/api/products/import", { items: rows });
      return res.json() as Promise<{ created: number; updated: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setImportPreview(null);
      toast({ title: "Import complete", description: `${result.created} added, ${result.updated} updated.` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/products", { barcode: newBarcode.trim(), name: newName.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setAddOpen(false);
      setNewBarcode("");
      setNewName("");
      toast({ title: "Product added" });
    },
    onError: (err: Error) =>
      toast({ title: "Could not add product", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await apiRequest("PATCH", `/api/products/${editing.id}`, { name: editName.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setEditing(null);
      toast({ title: "Product updated" });
    },
    onError: () => toast({ title: "Could not update product", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      setDeleting(null);
      toast({ title: "Product removed" });
    },
    onError: () => toast({ title: "Could not remove product", variant: "destructive" }),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">
            Product list
          </h1>
          <p className="text-sm text-muted-foreground">
            The master list of barcodes and product names used to match scans.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelected}
            data-testid="input-csv-file"
          />
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-csv">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button className="gap-2" onClick={() => setAddOpen(true)} data-testid="button-add-product">
            <Plus className="h-4 w-4" />
            Add product
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            CSV should have a <span className="font-mono">barcode</span> column and a{" "}
            <span className="font-mono">name</span> column (with or without a header row). Importing again
            updates names for barcodes that already exist.
          </p>
        </CardContent>
      </Card>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products"
          className="pl-9"
          data-testid="input-search-products"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product name</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    Loading products&hellip;
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground" data-testid="text-empty-products">
                    {products && products.length > 0 ? "No products match your search." : "No products yet. Import a CSV to get started."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p) => (
                <TableRow key={p.id} data-testid={`row-product-${p.id}`}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.barcode}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(p);
                          setEditName(p.name);
                        }}
                        data-testid={`button-edit-product-${p.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(p)} data-testid={`button-delete-product-${p.id}`}>
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

      {/* Import preview dialog */}
      <Dialog open={!!importPreview} onOpenChange={(open) => !open && setImportPreview(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-import-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {importFileName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="text-import-count">
              Found {importPreview?.length ?? 0} product rows.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border border-card-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importPreview?.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.barcode}</TableCell>
                      <TableCell>{row.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {importPreview && importPreview.length > 50 && (
              <p className="text-xs text-muted-foreground">Showing first 50 of {importPreview.length} rows.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)} data-testid="button-cancel-import">
              Cancel
            </Button>
            <Button
              disabled={!importPreview?.length || importMutation.isPending}
              onClick={() => importPreview && importMutation.mutate(importPreview)}
              data-testid="button-confirm-import"
            >
              Import {importPreview?.length ?? 0} products
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add product dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent data-testid="dialog-add-product">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <CardDescription>Register a single barcode and product name.</CardDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-barcode">Barcode</Label>
              <Input id="add-barcode" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} data-testid="input-add-barcode" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Product name</Label>
              <Input id="add-name" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="input-add-name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} data-testid="button-cancel-add-product">
              Cancel
            </Button>
            <Button
              disabled={!newBarcode.trim() || !newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-confirm-add-product"
            >
              Add product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit product dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent data-testid="dialog-edit-product">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-mono text-xs text-muted-foreground">{editing?.barcode}</p>
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Product name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-product-name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="button-cancel-edit-product">
              Cancel
            </Button>
            <Button disabled={!editName.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate()} data-testid="button-save-edit-product">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-testid="dialog-delete-product">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes any tracked batches for this product. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-product">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting.id)} data-testid="button-confirm-delete-product">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
