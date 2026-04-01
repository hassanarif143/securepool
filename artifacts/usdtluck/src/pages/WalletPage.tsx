import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateTransaction, useGetUserTransactions, getGetUserTransactionsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

export default function WalletPage() {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();

  if (!user) {
    navigate("/login");
    return null;
  }

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const createTxMutation = useCreateTransaction();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transactions, isLoading } = useGetUserTransactions(user.id, {
    query: {
      enabled: !!user.id,
      queryKey: getGetUserTransactionsQueryKey(user.id),
    },
  });

  function handleTransaction(type: "deposit" | "withdraw") {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    createTxMutation.mutate(
      { txType: type, amount: val, note },
      {
        onSuccess: (tx) => {
          toast({ title: `${type === "deposit" ? "Deposit" : "Withdrawal"} successful`, description: `${val} USDT ${type === "deposit" ? "added to" : "removed from"} your wallet` });
          setAmount("");
          setNote("");
          setUser({ ...user, walletBalance: tx.txType === "deposit" ? user.walletBalance + val : user.walletBalance - val });
          queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(user.id) });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Transaction failed", description: err?.message ?? "Could not process transaction", variant: "destructive" });
        },
      }
    );
  }

  function txColor(type: string) {
    if (type === "deposit" || type === "reward") return "text-green-600";
    return "text-red-500";
  }

  function txSign(type: string) {
    return type === "deposit" || type === "reward" ? "+" : "-";
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wallet</h1>
        <p className="text-muted-foreground mt-1">Manage your USDT balance</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
          <p className="text-4xl font-bold text-primary">{user.walletBalance.toFixed(2)}</p>
          <p className="text-muted-foreground mt-1">USDT</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deposit or Withdraw</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount (USDT)</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Bank transfer, TRC-20"
              />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => handleTransaction("deposit")}
                disabled={createTxMutation.isPending}
              >
                {createTxMutation.isPending ? "Processing..." : "Deposit USDT"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleTransaction("withdraw")}
                disabled={createTxMutation.isPending}
              >
                Withdraw USDT
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              This is a manual wallet system. Contact support to complete real USDT transfers.
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-semibold text-lg mb-4">Transaction History</h2>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : !transactions || transactions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">No transactions yet</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <Card key={tx.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm capitalize">{tx.txType.replace("_", " ")}</p>
                    {tx.note && <p className="text-xs text-muted-foreground">{tx.note}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                  </div>
                  <p className={`font-semibold ${txColor(tx.txType)}`}>
                    {txSign(tx.txType)}{tx.amount} USDT
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
