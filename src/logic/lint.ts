// Check generated and edited teacher messages before displaying them.
// Flag medical, diagnostic, and family vocabulary and suggest neutral
// replacements. Students choose whether to use them; lint never blocks.

export interface LintHit {
  term: string;
  index: number;
  suggestion: string;
}

const RULES: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /\b(seizures?|epilep\w*|concussions?|migraines?|asthma|diabet\w*|cancer|chemo\w*|surgery|surgeries|hospital\w*|ER\b|emergency room|urgent care|clinic|doctor'?s? (?:appointment|note|visit)|physician|specialist|neurolog\w*|cardiolog\w*)/gi, suggestion: "a health-related absence" },
  { pattern: /\b(anxiety|depress\w*|panic attacks?|ptsd|ocd|adhd|autis\w*|bipolar|eating disorder|self[- ]harm|suicid\w*|therap\w*|counsel(?:l)?ing|psychiatr\w*|psycholog\w*|mental health|breakdown|burnout)\b/gi, suggestion: "a personal situation" },
  { pattern: /\b(medication|meds|prescription|dosage|diagnos\w*|symptoms?|flare[- ]ups?|chronic|disabilit\w*|IEP|504 plan|accommodations? letter)\b/gi, suggestion: "an unexpected absence" },
  { pattern: /\b(divorce|custody|evict\w*|homeless\w*|funeral|passed away|died|death in (?:the|my) family|rehab|arrest\w*|jail|deport\w*|immigration)\b/gi, suggestion: "a family situation" },
  { pattern: /\b(my (?:mom|dad|mother|father|parent|brother|sister|grandm\w*|grandf\w*) (?:is|was|has been) (?:sick|ill|in the hospital|dying))\b/gi, suggestion: "a family situation" }
];

export function lintMessage(text: string): LintHit[] {
  const hits: LintHit[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      hits.push({ term: m[0], index: m.index, suggestion: rule.suggestion });
      if (m[0].length === 0) rule.pattern.lastIndex++;
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Replace every flagged term with its neutral phrase. */
export function neutralize(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match) => {
      // Keep sentence-initial capitalization.
      const cap = /^[A-Z]/.test(match) && !/^[A-Z]{2,}$/.test(match);
      return cap ? rule.suggestion.charAt(0).toUpperCase() + rule.suggestion.slice(1) : rule.suggestion;
    });
  }
  return out.replace(/\s{2,}/g, " ");
}
