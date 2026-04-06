import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, LogIn, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)] shadow-xl shadow-black/30 ring-1 ring-white/[0.04]">
        <CardContent className="pt-8 pb-8 px-6 sm:px-8 text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <SearchX className="h-7 w-7" strokeWidth={2} aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Page not found</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This URL doesn&apos;t match anything on SecurePool. Check the address or go back to your dashboard.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
            <Button className="min-h-11 w-full sm:w-auto font-semibold" style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }} asChild>
              <Link href="/">
                <Home className="h-4 w-4" aria-hidden />
                Home
              </Link>
            </Button>
            <Button variant="outline" className="min-h-11 w-full sm:w-auto border-border/90" asChild>
              <Link href="/login">
                <LogIn className="h-4 w-4" aria-hidden />
                Log in
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
