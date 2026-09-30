import Link from "next/link";

export function DeskFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <header className="flex items-center justify-between border-b border-black/10 px-12 py-5">
        <Link href="/" className="text-sm tracking-[0.18em] uppercase">
          Relay
        </Link>
        <Link
          href="/record"
          className="inline-flex h-12 items-center rounded-full bg-black px-8 text-sm font-medium text-white"
        >
          Record
        </Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
