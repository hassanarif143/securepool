import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TxIdHelpModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-emerald-500/20">
        <DialogHeader>
          <DialogTitle>TxID kya hai?</DialogTitle>
          <DialogDescription className="text-left space-y-2">
            <span className="block text-foreground/90">
              Transaction ID (TxID / TxHash) blockchain par aapki transfer ki unique ID hai. Binance withdrawal history
              mein completed transfer par tap karein — wahan long alphanumeric string milti hai.
            </span>
            <span className="block text-xs">
              Optional field hai, lekin TxID dene se admin aapki payment tez verify kar sakta hai.
            </span>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
