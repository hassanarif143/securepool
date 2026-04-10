import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCurrencyRate } from "@/hooks/useCurrencyRate";

type UsdtAmountProps = {
  amount: number;
  className?: string;
  amountClassName?: string;
  currencyClassName?: string;
  prefix?: string;
};

export function UsdtAmount({
  amount,
  className,
  amountClassName,
  currencyClassName,
  prefix = "",
}: UsdtAmountProps) {
  const { rates, localeCurrency } = useCurrencyRate();
  const usdt = Number(amount || 0);
  const localValue = useMemo(() => usdt * (rates[localeCurrency] ?? 0), [localeCurrency, rates, usdt]);

  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span className={cn("tabular-nums", amountClassName)}>
        {prefix}
        {usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
      </span>
      <span className={cn("text-[12px] text-[#64748b]", currencyClassName)}>
        ≈{" "}
        {localValue.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}{" "}
        {localeCurrency}
      </span>
    </span>
  );
}
