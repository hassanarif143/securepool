export type ShareCardRecord = {
  id: number;
  cardType: string;
  cardData: Record<string, unknown>;
  referralCode: string | null;
  shareCount: number;
  createdAt: string;
};
