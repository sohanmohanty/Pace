import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

type ButtonVariant = "primary" | "soft" | "ghost" | "danger";
type ButtonSize = "md" | "lg" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-deep",
  soft: "bg-brand-soft text-brand-deep hover:bg-brand-soft/70",
  ghost: "border-[1.5px] border-line bg-surface text-ink hover:bg-bg",
  danger: "bg-danger text-white hover:opacity-90"
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-[0.9rem]",
  md: "min-h-11 px-4",
  lg: "min-h-13 px-5 text-lg w-full"
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
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "form";
} & Record<string, unknown>) {
  return (
    <Tag {...rest} className={`rounded-2xl border border-line bg-surface p-5 shadow-sm ${className}`}>
      {children}
    </Tag>
  );
}

const CHIP_TONES = {
  neutral: "bg-bg text-soft border border-line",
  brand: "bg-brand-soft text-brand-deep",
  warn: "bg-warn-soft text-warn",
  good: "bg-good-soft text-good",
  danger: "bg-danger-soft text-danger"
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
      className={`inline-flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.82rem] font-medium ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[1.15rem] font-semibold tracking-tight">{children}</h2>;
}

/** Labeled field: the label element wraps the control, so no ids needed. */
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
  hint
}: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  hint?: string;
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
                className={`inline-flex min-h-10 items-center rounded-xl border-[1.5px] px-3.5 font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                  checked
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink hover:bg-bg"
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
  action
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight lg:text-[1.85rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
