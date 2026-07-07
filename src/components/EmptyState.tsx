import type { ReactNode } from "react";
import { Card } from "./ui";

export function EmptyState({
  title,
  body,
  children
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="mt-1.5 text-soft">{body}</p>}
      {children && <div className="mt-4 space-y-2">{children}</div>}
    </Card>
  );
}
