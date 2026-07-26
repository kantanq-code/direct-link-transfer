import { useEffect, useRef, useState } from "react";
import type Peer from "peerjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, Radio } from "lucide-react";
import {
  downloadFile,
  normalizeCode,
  PEER_PREFIX,
  setupReceiver,
  type TransferState,
} from "@/lib/peer";
import { TransferProgress } from "./TransferProgress";

interface ReceiveFlowProps {
  onBack: () => void;
}

export function ReceiveFlow({ onBack }: ReceiveFlowProps) {
  const [codeInput, setCodeInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TransferState>({ kind: "idle" });
  const [receivedFiles, setReceivedFiles] = useState<File[]>([]);
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);


  async function connect() {
    const code = normalizeCode(codeInput);
    if (code.length < 4) {
      setState({ kind: "error", message: "Please enter a valid code." });
      return;
    }

    setConnected(true);
    setState({ kind: "connecting" });

    const { default: PeerCtor } = await import("peerjs");
    const peer = new PeerCtor();

    peer.on("open", () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });

      conn.on("open", () => {
        setupReceiver(conn, setState, (files) => setReceivedFiles(files));
      });

      conn.on("error", () => {
        setState({
          kind: "error",
          message: "Could not connect. Check the code and try again.",
        });
      });
    });

    peer.on("error", (err) => {
      const type = (err as { type?: string }).type;
      if (type === "peer-unavailable") {
        setState({
          kind: "error",
          message: "No sender is waiting with that code.",
        });
      } else {
        setState({ kind: "error", message: err.message || "Connection service error" });
      }
    });
  }

  function reset() {
    peerRef.current?.destroy();
    peerRef.current = null;
    setConnected(false);
    setCodeInput("");
    setState({ kind: "idle" });
    setReceivedFiles([]);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Receive files
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!connected && (
          <>
            <div className="space-y-2">
              <Label htmlFor="code-input">Enter share code</Label>
              <Input
                id="code-input"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="e.g. abc234"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={10}
                className="text-center text-2xl font-mono tracking-widest uppercase"
                onKeyDown={(e) => {
                  if (e.key === "Enter") connect();
                }}
              />
            </div>
            <Button onClick={connect} disabled={!codeInput.trim()} className="w-full">
              Connect
            </Button>
          </>
        )}

        {connected && <TransferProgress state={state} />}

        {receivedFiles.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">Received files</p>
            <ul className="space-y-2">
              {receivedFiles.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{file.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(file)}
                    className="gap-1 shrink-0"
                  >
                    <Download className="h-4 w-4" />
                    Save
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.kind === "error" && connected && (
          <Button variant="outline" onClick={reset} className="w-full">
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
