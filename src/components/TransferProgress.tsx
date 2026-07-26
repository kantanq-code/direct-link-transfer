import { Progress } from "@/components/ui/progress";
import type { TransferState } from "@/lib/webrtc";

interface TransferProgressProps {
  state: TransferState;
}

export function TransferProgress({ state }: TransferProgressProps) {
  if (state.kind === "idle") return null;

  if (state.kind === "error") {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center">
        <p className="text-sm font-medium text-destructive">Error</p>
        <p className="text-sm text-destructive/90">{state.message}</p>
      </div>
    );
  }

  if (state.kind === "completed") {
    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-center">
        <p className="text-sm font-medium text-green-700 dark:text-green-300">Transfer complete!</p>
      </div>
    );
  }

  let message = "";
  let progress = 0;

  if (state.kind === "signaling") {
    message = state.message;
  } else if (state.kind === "connecting") {
    message = "Connecting peer-to-peer...";
  } else if (state.kind === "transferring") {
    message = `Transferring ${state.fileName}`;
    progress = state.total > 0 ? Math.round((state.sent / state.total) * 100) : 0;
  }

  return (
    <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-center text-sm text-card-foreground">{message}</p>
      {state.kind === "transferring" && (
        <>
          <Progress value={progress} className="h-2" />
          <p className="text-center text-xs text-muted-foreground">
            {formatBytes(state.sent)} / {formatBytes(state.total)}
          </p>
        </>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
