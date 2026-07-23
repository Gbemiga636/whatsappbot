"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  compact,
  showWordmark = true,
}: {
  className?: string;
  compact?: boolean;
  showWordmark?: boolean;
}) {
  const showText = showWordmark && !compact;

  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 group", className)}>
      <span className="relative h-9 w-9 overflow-hidden rounded-xl shadow-sm shadow-violet-900/15 ring-1 ring-black/5 transition group-hover:shadow-md">
        <Image
          src="/bygate-logo.png"
          alt="Bygate"
          width={36}
          height={36}
          className="h-full w-full object-cover"
          priority
          unoptimized
        />
      </span>
      {showText && (
        <span className="text-[17px] font-semibold tracking-tight text-gray-900">Bygate</span>
      )}
    </Link>
  );
}
