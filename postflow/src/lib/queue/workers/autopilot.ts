import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";
import { evaluateRule, type AutopilotRuleRecord } from "@/lib/autopilot";
import { type TriggerType, type ActionType } from "@prisma/client";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface AutopilotScanJobData {
  triggeredAt: string;
}

// ── Worker ────────────────────────────────────────────────────────────────────

export function createAutopilotWorker(): Worker<AutopilotScanJobData> {
  return new Worker<AutopilotScanJobData>(
    QUEUE_NAMES.AUTOPILOT_SCAN,
    async (job: Job<AutopilotScanJobData>) => {
      workerLogger.info({ jobId: job.id }, "Autopilot scan started");

      // Get all active rules grouped by user
      const rules = await prisma.autopilotRule.findMany({
        where: { isActive: true },
        select: {
          id: true,
          userId: true,
          name: true,
          trigger: true,
          conditionJson: true,
          action: true,
          actionDataJson: true,
          isActive: true,
          lastTriggeredAt: true,
          triggerCount: true,
        },
      });

      let triggered = 0;
      let errors = 0;

      for (const rule of rules) {
        const typedRule: AutopilotRuleRecord = {
          ...rule,
          trigger: rule.trigger as TriggerType,
          action: rule.action as ActionType,
          conditionJson: rule.conditionJson as Record<string, unknown>,
          actionDataJson: rule.actionDataJson as Record<string, unknown>,
        };

        const result = await evaluateRule(typedRule, rule.userId, prisma);

        if (result.triggered) {
          triggered++;
          workerLogger.info(
            { ruleId: rule.id, userId: rule.userId, actionTaken: result.actionTaken },
            "Autopilot rule triggered"
          );
        }

        if (result.error) {
          errors++;
          workerLogger.warn(
            { ruleId: rule.id, error: result.error },
            "Autopilot rule error"
          );
        }
      }

      workerLogger.info(
        { total: rules.length, triggered, errors },
        "Autopilot scan complete"
      );
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );
}
