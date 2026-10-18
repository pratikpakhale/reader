import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-steel-950 text-steel-50">
      <div className="mx-auto flex h-11 max-w-[1440px] items-center px-4 sm:px-6">
        <Link
          href="/"
          className="nameplate text-[15px] text-white transition-opacity hover:opacity-70"
        >
          Reader.
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
