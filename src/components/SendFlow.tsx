import { useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Copy, Send, Upload } from "lucide-react";
import {
  generateCode,
  PEER_PREFIX,
  sendFiles,
  type TransferState,
} from "@/lib/peer";
import { TransferProgress } from "./TransferProgress";

interface SendFlowProps {
  onBack: () => void;
}

export function SendFlow({ onBack }: SendFlowProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<TransferState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const peerRef = useRef<Peer | null>(null);
  const filesRef = useRef<File[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files;
    if (!selected || selected.length === 0) return;
    setFiles(Array.from(selected));
  }

  function startHosting() {
    if (files.length === 0) return;
    const newCode = generateCode();
    const peer = new Peer(PEER_PREFIX + newCode);
    peerRef.current = peer;

    peer.on("open", () => {
      setCode(newCode);
      setState({ kind: "waiting", code: newCode });
    });

    peer.on("error", (err) => {
      // If ID is taken (unlikely), retry with a new code
      if ((err as { type?: string }).type === "unavailable-id") {
        peer.destroy();
        startHosting();
        return;
      }
      setState({ kind: "error", message: err.message || "Connection service error" });
    });

    peer.on("connection", (conn: DataConnection) => {
      setState({ kind: "connecting" });
      conn.on("open", () => {
        sendFiles(conn, filesRef.current, setState);
      });
      conn.on("error", () => {
        setState({ kind: "error", message: "Connection error during transfer" });
      });
      conn.on("close", () => {
        // Transfer likely done; ignore.
      });
    });
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send files
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!code && (
          <>
            <div className="space-y-2">
              <Label htmlFor="file-input">Choose files</Label>
              <Input
                id="file-input"
                type="file"
                multiple
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
              {files.length > 0 && (
                <ul className="text-sm text-muted-foreground">
                  {files.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              onClick={startHosting}
              disabled={files.length === 0}
              className="w-full gap-2"
            >
              <Upload className="h-4 w-4" />
              Get share code
            </Button>
          </>
        )}

        {code && state.kind === "waiting" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Share this code with the receiver:
            </p>
            <div className="rounded-xl border border-border bg-muted/50 p-6">
              <p className="text-4xl font-mono font-bold tracking-widest text-foreground select-all">
                {code}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={copyCode} className="gap-2">
              <Copy className="h-4 w-4" />
              {copied ? "Copied!" : "Copy code"}
            </Button>
            <p className="text-xs text-muted-foreground">Waiting for receiver to connect…</p>
          </div>
        )}

        {code && state.kind !== "waiting" && <TransferProgress state={state} />}
      </CardContent>
    </Card>
  );
}
