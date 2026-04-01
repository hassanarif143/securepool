import { useState } from "react";
import { useLocation } from "wouter";
import { useUpdateUser } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();

  if (!user) {
    navigate("/login");
    return null;
  }

  const [name, setName] = useState(user.name);
  const updateMutation = useUpdateUser();
  const { toast } = useToast();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      { userId: user.id, data: { name } },
      {
        onSuccess: (updated) => {
          setUser({ ...user, name: updated.name });
          toast({ title: "Profile updated" });
        },
        onError: () => {
          toast({ title: "Update failed", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input value={user.email} disabled className="opacity-60" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
            <div className="space-y-1.5">
              <Label>Wallet Balance</Label>
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-muted">
                <span className="font-bold text-primary">{user.walletBalance.toFixed(2)} USDT</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Member since</Label>
              <Input value={new Date(user.joinedAt).toLocaleDateString()} disabled className="opacity-60" />
            </div>
            {user.isAdmin && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-primary font-medium">
                Administrator account
              </div>
            )}
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
