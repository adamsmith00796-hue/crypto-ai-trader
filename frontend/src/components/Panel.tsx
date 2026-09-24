import type { ReactNode } from "react";

export function Panel({
  title,
  sub,
  right,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      <header className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <div className="min-w-0">
          <h2 className="panel-title">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" />
            {title}
          </h2>
          {sub && <p className="panel-sub truncate">{sub}</p>}
        </div>
        {right}
      </header>
      <div className="min-h-0 flex-1 p-3 pt-2">{children}</div>
    </section>
  );
}

export function Loading({ h = 120 }: { h?: number }) {
  return <div className="animate-pulse rounded bg-white/5" style={{ height: h }} />;
}
