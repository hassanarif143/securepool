export type EntryDiscountBreakdown = {
  baseFee: number;
  vipDiscountPercent: number;
  comebackDiscountPercent: number;
  totalDiscountPercent: number;
  amountDue: number;
  savings: number;
};

const MAX_COMBINED = 25;

export function computeEntryDiscount(opts: {
  baseFee: number;
  vipDiscountPercent: number;
  comebackDiscountPercent: number;
}): EntryDiscountBreakdown {
  const { baseFee, vipDiscountPercent, comebackDiscountPercent } = opts;
  const totalDiscountPercent = Math.min(MAX_COMBINED, vipDiscountPercent + comebackDiscountPercent);
  const savings = Math.round(baseFee * (totalDiscountPercent / 100) * 100) / 100;
  const amountDue = Math.round((baseFee - savings) * 100) / 100;
  return {
    baseFee,
    vipDiscountPercent,
    comebackDiscountPercent,
    totalDiscountPercent,
    amountDue,
    savings,
  };
}
