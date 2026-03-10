import { z } from "zod";

export const sourceSchema = z.object({
  metric: z.string(),
  window: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const responseEnvelopeSchema = z.object({
  text: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sources: z.array(sourceSchema),
  timeWindow: z.string().min(1),
  intentType: z.enum(["informational", "recommendation", "action_task_creation", "outbound_posting"]),
});

export type ResponseEnvelopeShape = z.infer<typeof responseEnvelopeSchema>;
