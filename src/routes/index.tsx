import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Send, Download, Shield, Wifi, Smartphone } from "lucide-react";
import { SendFlow } from "@/components/SendFlow";
import { ReceiveFlow } from "@/components/ReceiveFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DirectDrop — Peer-to-Peer File Transfer" },
      { name: "description", content: "Transfer files directly between devices with no server, no database, and nothing stored online." },
      { property: "og:title", content: "DirectDrop — Peer-to-Peer File Transfer" },
      { property: "og:description", content: "Transfer files directly between devices with no server, no database, and nothing stored online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mode, setMode] = useState<"home" | "send" | "receive">("home");

  if (mode === "send") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <SendFlow onBack={() => setMode("home")} />
      </main>
    );
  }

  if (mode === "receive") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <ReceiveFlow onBack={() => setMode("home")} />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">DirectDrop</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Send files directly from one device to another. No server, no cloud, no accounts.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-4">
        <Button size="lg" onClick={() => setMode("send")} className="h-16 gap-3 text-lg">
          <Send className="h-5 w-5" />
          Send files
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setMode("receive")} className="h-16 gap-3 text-lg">
          <Download className="h-5 w-5" />
          Receive files
        </Button>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
          <CardDescription>Everything stays between your devices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Uses WebRTC for a direct peer-to-peer connection.</span>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Files are not stored online; blocked networks may use an encrypted relay.</span>
          </div>
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Works across PC, Mac, Android, and iPhone/iPad.</span>
          </div>
          <p className="text-xs">
            For Internet transfers, discovery servers help devices find each other. Direct transfer is tried first; strict networks may fall back to a temporary relay.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
