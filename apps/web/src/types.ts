export type ActiveView = 'mailboxes' | 'context' | 'actions' | 'analytics' | 'help';

export interface AnalyticsData {
  aiUsage: {
    daily: Array<{ date: string; estimatedNeurons: number; requestCount: number }>;
    total: { estimatedNeurons: number; requestCount: number };
  };
  processing: {
    daily: Array<{ date: string; summarized: number; skipped: number; error: number }>;
    total: { summarized: number; skipped: number; error: number; successRate: number };
  };
  actions: { byStatus: Record<string, number>; byType: Record<string, number> };
  context: { active: number; deleted: number; error: number; totalCharsIndexed: number };
}
