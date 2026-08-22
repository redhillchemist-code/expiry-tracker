import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanBarcode, Camera, CheckCircle2, PackagePlus, RotateCcw, Search } from "lucide-react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/expiry";
import type { Product, BatchWithProduct } from "@shared/schema";

type Stage = "idle" | "scanning" | "found" | "not-found" | "added";

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ScannerPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>("idle");
  const [barcode, setBarcode] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState(todayPlus(180));
  const guardRef = useRef(false);

  const { data: recentBatches } = useQuery<BatchWithProduct[]>({ queryKey: ["/api/batches"] });
  const recent = [...(recentBatches ?? [])]
    .sort((a, b) => (a.scannedAt < b.scannedAt ? 1 : -1))
    .slice(0, 5);

  async function handleCode(code: string) {
    if (guardRef.current) return;
    guardRef.current = true;
    setBarcode(code);
    setStage("idle");
    try {
      const res = await apiRequest("GET", `/api/products/lookup/${encodeURIComponent(code)}`);
      const found: Product = await res.json();
      setProduct(found);
      setStage("found");
    } catch {
      setProduct(null);
      setNewProductName("");
      setStage("not-found");
    }
  }

  function startScanning() {
    guardRef.current = false;
    setBarcode("");
    setProduct(null);
    setQuantity("1");
    setExpiryDate(todayPlus(180));
    setStage("scanning");
  }

  function resetToIdle() {
    guardRef.current = false;
    setStage("idle");
    setBarcode("");
    setProduct(null);
  }

  const createProductMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/products", { barcode, name });
      return (await res.json()) as Product;
    },
    onSuccess: (created) => {
      setProduct(created);
      setStage("found");
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => {
      toast({ title: "Could not register product", variant: "destructive" });
    },
  });

  const addBatchMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product selected");
      const res = await apiRequest("POST", "/api/batches", {
        productId: product.id,
        quantity: Number(quantity) || 1,
        expiryDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      setStage("added");
      toast({ title: "Batch added", description: `${product?.name} tracked until ${formatDate(expiryDate)}` });
    },
    onError: () => {
      toast({ title: "Could not save this batch", variant: "destructive" });
    },
  });

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualBarcode.trim();
    if (!code) return;
    setManualBarcode("");
    handleCode(code);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">
          Scan a product
        </h1>
        <p className="text-sm text-muted-foreground">
          Scan a barcode to match it against your product list, then log its expiry date.
        </p>
      </div>

      {stage === "idle" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <div className="rounded-full bg-accent p-4">
              <ScanBarcode className="h-8 w-8 text-accent-foreground" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Point your camera at a product barcode, or enter one manually below.
            </p>
            <Button onClick={startScanning} size="lg" className="gap-2" data-testid="button-start-scan">
              <Camera className="h-4 w-4" />
              Start scanning
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "scanning" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <BarcodeScanner active onDetected={handleCode} />
            <p className="text-center text-xs text-muted-foreground">
              Align the barcode within the frame. It will scan automatically.
            </p>
            <Button variant="outline" className="w-full" onClick={resetToIdle} data-testid="button-cancel-scan">
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "not-found" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Barcode not recognised</CardTitle>
            <CardDescription>
              <span className="font-mono" data-testid="text-scanned-barcode">
                {barcode}
              </span>{" "}
              isn't in your product list yet. Give it a name to register it and start tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-product-name">Product name</Label>
              <Input
                id="new-product-name"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g. Panadol Rapid 500mg 20 Tablets"
                data-testid="input-new-product-name"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetToIdle} data-testid="button-skip-product">
                Skip
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={!newProductName.trim() || createProductMutation.isPending}
                onClick={() => createProductMutation.mutate(newProductName.trim())}
                data-testid="button-register-product"
              >
                <PackagePlus className="h-4 w-4" />
                Register &amp; continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "found" && product && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" data-testid="text-product-name">
              {product.name}
            </CardTitle>
            <CardDescription className="font-mono" data-testid="text-product-barcode">
              {product.barcode}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  data-testid="input-quantity"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expiry-date">Expiry date</Label>
                <Input
                  id="expiry-date"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  data-testid="input-expiry-date"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetToIdle} data-testid="button-cancel-batch">
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={!expiryDate || addBatchMutation.isPending}
                onClick={() => addBatchMutation.mutate()}
                data-testid="button-save-batch"
              >
                <CheckCircle2 className="h-4 w-4" />
                Add to tracked stock
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "added" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <div className="rounded-full bg-expiry-fresh-bg p-4">
              <CheckCircle2 className="h-8 w-8 text-expiry-fresh" />
            </div>
            <p className="text-center text-sm text-foreground">
              <span className="font-semibold" data-testid="text-added-product-name">
                {product?.name}
              </span>{" "}
              is now being tracked.
            </p>
            <Button onClick={startScanning} size="lg" className="gap-2" data-testid="button-scan-next">
              <RotateCcw className="h-4 w-4" />
              Scan next item
            </Button>
          </CardContent>
        </Card>
      )}

      {(stage === "idle" || stage === "not-found" || stage === "found") && (
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="Or type a barcode manually"
              className="pl-9"
              data-testid="input-manual-barcode"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!manualBarcode.trim()} data-testid="button-manual-lookup">
            Look up
          </Button>
        </form>
      )}

      {recent.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Recently scanned</h2>
          <div className="space-y-2">
            {recent.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-md border border-card-border bg-card px-3 py-2"
                data-testid={`row-recent-${b.id}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{b.productName}</p>
                  <p className="text-xs text-muted-foreground">Qty {b.quantity} &middot; Expires {formatDate(b.expiryDate)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
