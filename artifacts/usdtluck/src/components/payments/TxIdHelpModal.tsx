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
          <DialogTitle>What is TxID?</DialogTitle>
          <DialogDescription className="text-left space-y-2">
            <span className="block text-foreground/90">
              Transaction ID (TxID / TxHash) is the unique ID of your transfer on the blockchain. In Binance withdrawal
              history, open the completed transfer — you will see a long alphanumeric string.
            </span>
            <span className="block text-xs">
              This field is optional, but adding TxID can help us verify your payment faster.
            </span>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
