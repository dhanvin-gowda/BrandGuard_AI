import type { Activity, Scan } from "@/types";
import { getScan as getPersistentScan } from "./scanStore";

/** Empty baseline; live application uses persistent scan and audit state. */
export const scans: Scan[] = [];
export const activities: Activity[] = [];

export const getScan = (id: string): Scan | undefined => {
  return getPersistentScan(id);
};
