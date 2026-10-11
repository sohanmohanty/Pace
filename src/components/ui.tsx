import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

// Shared buttons, cards, chips, fields, radio groups, and page headers.
// Colors and appearance come from globals.css tokens for all three themes
// and the capacity tint.

type ButtonVariant = "primary" | "soft" | "ghost" | "danger" | "tint";
type ButtonSize = "md" | "lg" | "sm" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-deep active:scale-[0.985] shadow-sm",
  soft: "bg-brand-soft text-brand-deep hover:brightness-[0.97] active:scale-[0.985]",
  ghost:
    "border-[1.5px] border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2 active:scale-[0.985]",
  danger: "bg-danger text-on-danger hover:opacity-90 active:scale-[0.985]",
  tint: "bg-tint text-tint-ink hover:brightness-[0.97] active:scale-[0.985]"
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-[0.9rem] rounded-[0.7rem]",
  md: "min-h-11 px-4 rounded-[0.875rem]",
  lg: "min-h-13 px-5 text-[1.05rem] w-full rounded-[1rem]",
  icon: "h-11 w-11 rounded-[0.875rem]"
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-[background-color,border-color,transform,filter,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
  tint = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "form" | "aside";
  tint?: boolean;
} & Record<string, unknown>) {
  return (
    <Tag {...rest} className={`card p-5 ${tint ? "card-tint" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

const CHIP_TONES = {
  neutral: "bg-surface-2 text-soft",
  brand: "bg-brand-soft text-brand-deep",
  warn: "bg-warn-soft text-warn",
  good: "bg-good-soft text-good",
  danger: "bg-danger-soft text-danger",
  tint: "bg-tint text-tint-ink"
};

export function Chip({
  tone = "neutral",
  children,
  className = ""
}: {
  tone?: keyof typeof CHIP_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h2 className={`text-[1.2rem] leading-tight ${className}`}>{children}</h2>;
}

/** Small uppercase label for groups of things. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-soft ${className}`}
    >
      {children}
    </p>
  );
}

/** Wrap the control in its label so a separate ID is unnecessary. */
export function Field({
  label,
  hint,
  children,
  className = ""
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="font-medium">{label}</span>
      {hint && <span className="mt-0.5 block text-[0.9rem] text-soft">{hint}</span>}
      {children}
    </label>
  );
}

/** Accessible chip-style radio group built on native radios. */
export function ChipRadios<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  hint,
  size = "md"
}: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  hint?: string;
  size?: "sm" | "md";
}) {
  return (
    <fieldset>
      <legend className="font-medium">{legend}</legend>
      {hint && <p className="mt-0.5 text-[0.9rem] text-soft">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value === opt.value;
          return (
            <label key={String(opt.value)} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                className="peer visually-hidden"
                checked={checked}
                onChange={() => onChange(opt.value)}
              />
              <span
                className={`inline-flex items-center rounded-full border-[1.5px] font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                  size === "sm" ? "min-h-9 px-3 text-[0.9rem]" : "min-h-10 px-3.5"
                } ${
                  checked
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2"
                }`}
              >
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Multi-select chips on native checkboxes. */
export function ChipChecks<T extends string>({
  legend,
  options,
  value,
  onChange,
  hint
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  hint?: string;
}) {
  function toggle(v: T) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <fieldset>
      <legend className="font-medium">{legend}</legend>
      {hint && <p className="mt-0.5 text-[0.9rem] text-soft">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value.includes(opt.value);
          return (
            <label key={opt.value} className="cursor-pointer">
              <input
                type="checkbox"
                className="peer visually-hidden"
                checked={checked}
                onChange={() => toggle(opt.value)}
              />
              <span
                className={`inline-flex min-h-10 items-center rounded-full border-[1.5px] px-3.5 font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                  checked
                    ? "border-tint-strong bg-tint text-tint-ink"
                    : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2"
                }`}
              >
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h1 className="text-[1.85rem] leading-[1.1] lg:text-[2.2rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-line ${className}`} aria-hidden="true" />;
}
