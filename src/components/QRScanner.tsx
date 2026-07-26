import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface QRScannerProps {
  onScan: (data: string) => void;
  label?: string;
}

export function QRScanner({ onScan, label }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  async function startCamera() {
    setError(null);
    scannedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setActive(true);
      scanLoop();
    } catch (err) {
      setError("Could not access camera. Check permissions or use the text input below.");
      setActive(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setActive(false);
  }

  async function scanLoop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import("jsqr");
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });

    if (code && !scannedRef.current) {
      scannedRef.current = true;
      onScan(code.data);
      stopCamera();
      return;
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-border bg-black">
        <video ref={videoRef} className="w-full" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {!active && !error && (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted">
            <p className="text-sm text-muted-foreground">Camera is off</p>
          </div>
        )}
      </div>

      {label && <p className="text-center text-sm text-muted-foreground">{label}</p>}

      <Button
        type="button"
        variant={active ? "destructive" : "default"}
        onClick={active ? stopCamera : startCamera}
        className="gap-2"
      >
        {active ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {active ? "Stop camera" : "Scan with camera"}
      </Button>

      {error && <p className="max-w-xs text-center text-sm text-destructive">{error}</p>}

      <details className="w-full max-w-xs">
        <summary className="cursor-pointer text-xs text-muted-foreground">Paste as text instead</summary>
        <textarea
          className="mt-2 h-24 w-full rounded-md border border-input bg-background p-2 text-xs font-mono text-foreground"
          placeholder="Paste the QR code data here..."
          onChange={(e) => {
            const value = e.target.value.trim();
            if (value) onScan(value);
          }}
        />
      </details>
    </div>
  );
}
