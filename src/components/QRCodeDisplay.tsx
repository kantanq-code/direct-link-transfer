import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QRCodeDisplayProps {
  data: string;
  label?: string;
}

export function QRCodeDisplay({ data, label }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    QRCode.toCanvas(canvas, data, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "L",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    }).catch(() => {
      // QR generation errors are surfaced by the empty canvas
    });
  }, [data]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
        <canvas ref={canvasRef} className="block" aria-label={label ?? "QR code"} />
      </div>
      {label && <p className="text-center text-sm text-muted-foreground">{label}</p>}
      <details className="w-full max-w-xs">
        <summary className="cursor-pointer text-xs text-muted-foreground">Copy as text instead</summary>
        <textarea
          readOnly
          value={data}
          className="mt-2 h-24 w-full rounded-md border border-input bg-background p-2 text-xs font-mono text-foreground"
        />
      </details>
    </div>
  );
}
