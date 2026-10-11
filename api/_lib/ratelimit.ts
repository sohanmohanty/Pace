// Daily AI call caps per random, anonymous device token and IP in key mode.
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN enable shared
// counters across instances. Otherwise, use an in-memory counter per instance
// to limit runaway calls. Plan and mock modes are exempt.

const PER_DEVICE_PER_DAY = Number(process.env.PACE_LIMIT_DEVICE || 50);
const PER_IP_PER_DAY = Number(process.env.PACE_LIMIT_IP || 250);

const memory = new Map<string, { n: number; day: string }>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function bump(key: string): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const fullKey = `pace:${today()}:${key}`;
  if (url && token) {
    try {
      const response = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([
          ["INCR", fullKey],
          ["EXPIRE", fullKey, 60 * 60 * 36]
        ])
      });
      if (response.ok) {
        const results = (await response.json()) as { result: number }[];
        return Number(results[0]?.result ?? 0);
      }
    } catch {
      /* fall through to memory */
    }
  }
  const day = today();
  const current = memory.get(key);
  const count = current && current.day === day ? current.n + 1 : 1;
  memory.set(key, { n: count, day });
  if (memory.size > 5000) memory.clear();
  return count;
}

export interface LimitResult {
  allowed: boolean;
  reason?: "device" | "ip";
}

/** Count this call against the device and the IP. Only enforced in key mode. */
export async function checkLimit(request: Request): Promise<LimitResult> {
  const device = request.headers.get("x-pace-device")?.slice(0, 64) || "anon";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const [deviceCalls, ipCalls] = await Promise.all([bump(`d:${device}`), bump(`ip:${ip}`)]);
  if (deviceCalls > PER_DEVICE_PER_DAY) return { allowed: false, reason: "device" };
  if (ipCalls > PER_IP_PER_DAY) return { allowed: false, reason: "ip" };
  return { allowed: true };
}
