import { z } from "zod";

export const metricResultSchema = z.object({
  metric: z.string(),
  value: z.number().nullable(),
  unit: z.string().optional(),
  window: z.string(),
  source: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()).optional(),
});

export const trendResultSchema = z.object({
  metric: z.string(),
  current: z.number().nullable(),
  previous: z.number().nullable(),
  delta: z.number().nullable(),
  delta_pct: z.number().nullable(),
  window: z.string(),
  compare_to: z.string(),
  source: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()).optional(),
});

export const taskResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  due_date: z.string().optional(),
  source: z.string().optional(),
  url: z.string().optional(),
});

export const followupResultSchema = z.object({
  id: z.string(),
  topic: z.string(),
  owner: z.string(),
  due_date: z.string(),
  status: z.string(),
});
