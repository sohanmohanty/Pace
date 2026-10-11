import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { saveCheckIn, savePlanForToday } from "../data/repo";
import { DIAL_FOR } from "../logic/capacity";
import { buildLocalPlan, usePlannerData } from "../lib/usePlanner";

/** Set a low dial, create a small plan if needed, and open Focus. Preserve existing /low links. */
export function LowCapacity() {
  const navigate = useNavigate();
  const data = usePlannerData();
  const ran = useRef(false);

  useEffect(() => {
    if (!data.ready || ran.current) return;
    ran.current = true;
    (async () => {
      const low = { dial: DIAL_FOR.low, unsure: false, windows: [], heavy: [], availableMinutes: 0 };
      if (data.checkIn?.dial === undefined || data.checkIn.dial > 30) {
        await saveCheckIn({ dial: low.dial, availableMinutes: data.checkIn?.availableMinutes });
      }
      const hasOpen = data.openTasks.length > 0;
      if (hasOpen && (!data.plan || (data.plan.dial ?? 50) > 30)) {
        const built = buildLocalPlan(low, data.activeTasks, data.subtasks, data.multiplier);
        if (built.actions.length > 0) await savePlanForToday(built);
      }
      navigate("/focus", { replace: true });
    })();
  }, [data, navigate]);

  return null;
}
