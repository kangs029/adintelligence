import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface SourceLinkProps {
  href: string;
  children: React.ReactNode;
}

export function SourceLink({ href, children }: SourceLinkProps) {
  const isExternal = href.startsWith("http");

  if (isExternal) {
    return (
      <a
        className="source-link"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {children}
        <ExternalLink size={12} aria-hidden="true" />
      </a>
    );
  }

  return (
    <Link className="source-link" href={href}>
      {children}
      <ExternalLink size={12} aria-hidden="true" />
    </Link>
  );
}
