export type AiChangeReview = {
  reviewId: string;
  chatId: string;
  status: string;
  version: number;
  hash: string;
  expiresAt: string;
  changes: unknown;
  before: unknown;
  actions: { action: string; code: string; title: string; version: number }[];
};
