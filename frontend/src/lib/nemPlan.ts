export type NemPlan = "nem1" | "nem2" | "nem3" | "custom";

export const NEM_PLAN_OPTIONS: { id: NemPlan; label: string; hint: string }[] = [
  {
    id: "nem2",
    label: "NEM 2.0 (Legacy)",
    hint: "Retail net metering — export kWh credited at your import (retail) rate. Annual true-up.",
  },
  {
    id: "nem1",
    label: "NEM 1.0 (Legacy)",
    hint: "Same retail net metering model as NEM 2.0 for savings estimates.",
  },
  {
    id: "nem3",
    label: "NEM 3.0 (Solar Billing Plan)",
    hint: "Post-2023 export compensation is much lower — set export rate to your ACC / avoided-cost value.",
  },
  {
    id: "custom",
    label: "Custom rates",
    hint: "Set import and export $/kWh independently.",
  },
];

export const NEM_PLAN_LABELS: Record<NemPlan, string> = {
  nem1: "NEM 1.0",
  nem2: "NEM 2.0",
  nem3: "NEM 3.0",
  custom: "Custom",
};

export function parseNemPlan(raw: string | undefined): NemPlan {
  if (raw === "nem1" || raw === "nem2" || raw === "nem3" || raw === "custom") return raw;
  return "nem2";
}

export function usesRetailExportCredit(plan: NemPlan): boolean {
  return plan === "nem1" || plan === "nem2";
}

export function nemPlanSavingsNote(plan: NemPlan | undefined): string | null {
  switch (plan) {
    case "nem1":
    case "nem2":
      return "Under legacy NEM, exported kWh are credited at your retail import rate (1:1 net metering). This is a simplified period estimate — your utility bill may also include fixed charges, TOU tiers, and an annual true-up.";
    case "nem3":
      return "Under NEM 3.0 (Solar Billing Plan), export compensation is much lower than retail. Set your export rate to the ACC / avoided-cost value from your utility — not your import rate.";
    case "custom":
      return null;
    default:
      return null;
  }
}
