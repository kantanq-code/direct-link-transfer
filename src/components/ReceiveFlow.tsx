import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, Radio } from "lucide-react";
import {
  createAnswer,
  createPeerConnection,
  setupReceiver,
  downloadFile,
  type TransferState,
} from "@/lib/webrtc";
import { compressString, decompressString } from "@/lib/compress";
import { QRCodeDisplay } from "./QRCodeDisplay";
import { QRScanner } from "./QRScanner";
import { TransferProgress } from "./TransferProgress";

interface ReceiveFlowProps {
  onBack: () => void;
}

export function ReceiveFlow({ onBack }: ReceiveFlowProps) {
  const [offerData, setOfferData] = useState<string | null>(null);
  const [answerData, setAnswerData] = useState<string | null>(null);
  const [state, setState] = useState<TransferState>({ kind: "idle" });
  const [receivedFiles, setReceivedFiles] = useState<File[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  async function handleOfferScan(data: string) {
    if (pcRef.current) return;

    setState({ kind: "signaling", message: "Creating connection answer..." });

    try {
      const decompressed = await decompressString(data);
      const offer = JSON.parse(decompressed) as RTCSessionDescriptionInit;
      const pc = createPeerConnection();
      pcRef.current = pc;

      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "connected") {
          setState({ kind: "connecting" });
        } else if (pc.connectionState === "failed") {
          setState({ kind: "error", message: "Peer-to-peer connection failed. Try again on the same network." });
        }
      });

      setupReceiver(pc, setState, (files) => {
        setReceivedFiles(files);
      });

      const answer = await createAnswer(pc, offer);
      const compressed = await compressString(JSON.stringify(answer));
      setOfferData(data);
      setAnswerData(compressed);
      setState({ kind: "signaling", message: "Show this QR code to the sender to complete the connection." });
    } catch (err) {
      setState({ kind: "error", message: "Invalid offer QR code. Please try again." });
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
            <Radio className="h-5 w-5" />
            Receive files
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!answerData && (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Scan the sender&apos;s QR code to begin.
            </p>
            <QRScanner onScan={handleOfferScan} label="Point camera at sender&apos;s offer QR" />
          </>
        )}

        {answerData && (
          <div className="space-y-6">
            <QRCodeDisplay data={answerData} label="Show this code to the sender" />
            <TransferProgress state={state} />
          </div>
        )}

        {receivedFiles.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">Received files</p>
            <ul className="space-y-2">
              {receivedFiles.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{file.name}</span>
                  <Button size="sm" variant="outline" onClick={() => downloadFile(file)} className="gap-1 shrink-0">
                    <Download className="h-4 w-4" />
                    Save
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
