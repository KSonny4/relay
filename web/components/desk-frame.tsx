import Link from "next/link";

export function DeskFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-[clamp(1.25rem,4vw,3rem)] py-4 md:py-5">
        <Link href="/" className="text-sm tracking-[0.18em] text-white uppercase">
          Relay
        </Link>
        <Link
          href="/record"
          className="inline-flex h-12 shrink-0 items-center rounded-full bg-white px-6 text-sm font-medium text-black md:px-8"
        >
          Record
        </Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
