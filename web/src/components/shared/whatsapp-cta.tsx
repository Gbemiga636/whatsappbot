"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/constants";

export function WhatsAppCTA({
  label = "Open WhatsApp bot",
  message,
  size = "md",
  className,
}: {
  label?: string;
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <Button asChild variant="whatsapp" size={size} className={className}>
      <a href={whatsappLink(message)} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="h-4 w-4" aria-hidden />
        {label}
      </a>
    </Button>
  );
}

export function WhatsAppTextLink({
  children = "Chat on WhatsApp",
  message,
  className,
}: {
  children?: React.ReactNode;
  message?: string;
  className?: string;
}) {
  return (
    <Link
      href={whatsappLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </Link>
  );
}
