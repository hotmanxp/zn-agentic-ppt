import { z } from "zod";

export const intentSchema = z.object({
  audience: z.object({
    profile: z.string().min(1).max(200),
    expertise: z.enum(["新手", "熟手", "专家"]),
    concerns: z.array(z.string()),
  }),
  goal_decomposition: z.object({
    primary: z.string().min(1),
    secondary: z.array(z.string()),
  }),
  tone: z.enum(["professional", "technical", "inspirational", "casual"]),
  constraints: z.object({
    duration: z.string().min(1),
    pages: z.number().int().positive(),
    language: z.enum(["zh-CN", "en"]),
  }),
  must_cover_points: z.array(z.string()),
  forbidden: z.array(z.string()),
  narrative_arc: z.string(),
});

export type IntentSummary = z.infer<typeof intentSchema>;
