import type { PlanAction } from "../data/types";
import { StepCard } from "./StepCard";

/** Keep the existing PlanActionCard interface while rendering StepCard. */
export function PlanActionCard({
  action,
  onToggle,
  readOnly = false
}: {
  action: PlanAction;
  onToggle?: (id: string) => void;
  readOnly?: boolean;
}) {
  return <StepCard action={action} taskOrder={[]} onToggle={onToggle} readOnly={readOnly} />;
}
