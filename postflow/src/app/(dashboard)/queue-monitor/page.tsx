import { Metadata } from "next";
import { QueueMonitorPageClient } from "./queue-monitor-client";

export const metadata: Metadata = { title: "Queue Monitor — PostFlow" };

export default function QueueMonitorPage() {
  return <QueueMonitorPageClient />;
}
