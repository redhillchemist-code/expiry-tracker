import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat, NotFoundException } from "@zxing/library";
import type { IScannerControls } from "@zxing/browser";
import { CameraOff } from "lucide-react";

const RETAIL_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.QR_CODE,
];

interface BarcodeScannerProps {
  active: boolean;
  onDetected: (code: string) => void;
}

export function BarcodeScanner({ active, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    setError(null);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });

    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current ?? "",
        (result, err) => {
          if (cancelled || !result) return;
          onDetectedRef.current(result.getText());
        }
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Camera access was denied. Allow camera permissions and try again."
              : err.message
            : "Could not access the camera.";
        setError(message);
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black" data-testid="container-camera">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline data-testid="video-camera" />
      {!error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div className="h-full max-h-40 w-full max-w-xs rounded-lg border-2 border-white/70 shadow-[0_0_0_2000px_rgba(0,0,0,0.35)]" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card p-6 text-center">
          <CameraOff className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-foreground" data-testid="text-camera-error">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

export { NotFoundException };
