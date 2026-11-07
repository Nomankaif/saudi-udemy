import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" aria-label="Certify home" className={`portal-brand${inverse ? " portal-brand-inverse" : ""}`}>
    <span className="portal-brand-mark" aria-hidden="true">c<span /></span>
    <span>Certify<span className="portal-brand-caption">CERTIFICATION PRACTICE</span></span>
  </Link>;
}
