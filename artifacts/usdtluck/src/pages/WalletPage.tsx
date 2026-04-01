import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetUserTransactions, getGetUserTransactionsQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PLATFORM_ADDRESS = "TQn9Y2khEsLJW1ChVWFMSMeRDow5kBDaVR";

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge className="bg-green-100 text-green-800 border-green-200">Completed</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200">Failed</Badge>;
}

function txLabel(type: string) {
  if (type === "deposit") return "Deposit";
  if (type === "withdraw") return "Withdrawal";
  if (type === "reward") return "Reward";
  return "Pool Entry";
}

function txColor(type: string) {
  if (type === "deposit" || type === "reward") return "text-green-600";
  return "text-red-500";
}

export default function WalletPage() {
  const { user, isLoading, setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: transactions, isLoading: txsLoading } = useGetUserTransactions(user?.id ?? 0, {
    query: {
      enabled: !!user?.id,
      queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0),
    },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  if (isLoading || !user) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (!screenshotFile) { toast({ title: "Please upload a payment screenshot", variant: "destructive" }); return; }

    setDepositLoading(true);
    try {
      const formData = new FormData();
      formData.append("amount", String(val));
      formData.append("screenshot", screenshotFile);
      if (note) formData.append("note", note);

      const res = await fetch("/api/transactions/deposit", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Deposit failed");
      }

      setAmount("");
      setNote("");
      setScreenshotFile(null);
      setScreenshotPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(user.id) });
      toast({
        title: "Deposit submitted!",
        description: "Your payment is under review. Funds will be credited once approved.",
      });
    } catch (err: any) {
      toast({ title: "Deposit failed", description: err.message, variant: "destructive" });
    } finally {
      setDepositLoading(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }

    setWithdrawLoading(true);
    try {
      const res = await fetch("/api/transactions/withdraw", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, note }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Withdrawal failed");
      }

      const tx = await res.json();
      setUser({ ...user, walletBalance: user.walletBalance - val });
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(user.id) });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Withdrawal submitted", description: "Your request is pending admin approval." });
    } catch (err: any) {
      toast({ title: "Withdrawal failed", description: err.message, variant: "destructive" });
    } finally {
      setWithdrawLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wallet</h1>
        <p className="text-muted-foreground mt-1">Manage your USDT balance</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Available Balance</p>
          <p className="text-4xl font-bold text-primary mt-1">{user.walletBalance.toFixed(2)} <span className="text-lg">USDT</span></p>
        </CardContent>
      </Card>

      <Tabs defaultValue="deposit">
        <TabsList className="w-full">
          <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
        </TabsList>

        <TabsContent value="deposit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deposit USDT</CardTitle>
              <CardDescription>Send USDT to our address below, then upload your payment screenshot for verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Send USDT (TRC-20) to:</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-semibold text-foreground break-all flex-1">{PLATFORM_ADDRESS}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(PLATFORM_ADDRESS); toast({ title: "Address copied!" }); }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Network: TRC-20 (Tron). Do NOT send on other networks.</p>
              </div>

              {user.cryptoAddress ? (
                <div className="text-xs text-muted-foreground bg-muted rounded p-3">
                  Your registered wallet: <span className="font-mono font-medium">{user.cryptoAddress}</span>
                </div>
              ) : (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
                  Tip: Add your wallet address in your <a href="/profile" className="underline font-medium">Profile</a> so we can verify your payment faster.
                </div>
              )}

              <form onSubmit={handleDeposit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dep-amount">Amount (USDT)</Label>
                  <Input
                    id="dep-amount"
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 50"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dep-screenshot">Payment Screenshot</Label>
                  <input
                    ref={fileInputRef}
                    id="dep-screenshot"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    required
                  />
                  <p className="text-xs text-muted-foreground">Upload a screenshot showing your USDT transaction. Max 10MB.</p>
                </div>

                {screenshotPreview && (
                  <div className="rounded border overflow-hidden">
                    <img src={screenshotPreview} alt="Payment preview" className="max-h-48 w-full object-contain" />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="dep-note">Note (optional)</Label>
                  <Input
                    id="dep-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. TXN ID or any reference"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={depositLoading}>
                  {depositLoading ? "Submitting..." : "Submit Deposit Request"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdraw" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Withdraw USDT</CardTitle>
              <CardDescription>Withdrawal requests are reviewed and processed by the admin team.</CardDescription>
            </CardHeader>
            <CardContent>
              {!user.cryptoAddress && (
                <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                  Please add your USDT wallet address in your <a href="/profile" className="underline font-medium">Profile</a> before withdrawing.
                </div>
              )}
              <form onSubmit={handleWithdraw} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wd-amount">Amount (USDT)</Label>
                  <Input
                    id="wd-amount"
                    type="number"
                    min="1"
                    step="0.01"
                    max={user.walletBalance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Max: ${user.walletBalance.toFixed(2)}`}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wd-note">Withdrawal Address / Note</Label>
                  <Input
                    id="wd-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={user.cryptoAddress ?? "Enter your USDT wallet address"}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={withdrawLoading || user.walletBalance <= 0}>
                  {withdrawLoading ? "Submitting..." : "Request Withdrawal"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {txsLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : !transactions || transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {(transactions as any[]).map((tx) => (
                <Card key={tx.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{txLabel(tx.txType)}</span>
                          <StatusBadge status={tx.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(tx.createdAt).toLocaleString()}
                          {tx.note && ` · ${tx.note}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${txColor(tx.txType)}`}>
                          {tx.txType === "deposit" || tx.txType === "reward" ? "+" : "-"}{tx.amount.toFixed(2)} USDT
                        </p>
                        {tx.screenshotUrl && (
                          <a
                            href={tx.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary underline"
                          >
                            View receipt
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
