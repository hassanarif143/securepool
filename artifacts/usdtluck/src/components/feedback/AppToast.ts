import { toast } from "@/hooks/use-toast";

type ToastVariant = "default" | "destructive";

type AppToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

export const appToast = {
  success(input: Omit<AppToastInput, "variant">) {
    toast({ ...input, variant: "default" });
  },
  error(input: Omit<AppToastInput, "variant">) {
    toast({ ...input, variant: "destructive" });
  },
  info(input: Omit<AppToastInput, "variant">) {
    toast({ ...input, variant: "default" });
  },
  warning(input: Omit<AppToastInput, "variant">) {
    toast({ ...input, variant: "default" });
  },
};
