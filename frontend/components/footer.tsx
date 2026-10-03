import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-slate-950 pt-14 text-slate-300">
      <div className="mx-auto grid w-[min(1180px,calc(100%-40px))] grid-cols-2 gap-9 pb-12 md:grid-cols-4 md:gap-14">
        <div className="col-span-2 md:col-span-1">
          <div className="mb-4 inline-flex items-center gap-2.5 text-2xl font-extrabold text-white">
            <span className="grid size-9 place-items-center rounded-lg bg-violet-600">
              C
            </span>
            Certify
          </div>
          <p className="max-w-sm text-sm leading-7 text-slate-400">
            Professional practice exams designed to help you prepare with
            confidence.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <h3 className="mb-1 font-bold text-white">Explore</h3>
          <Link className="hover:text-white" href="/exams">
            All exams
          </Link>
          <Link className="hover:text-white" href="/blog">
            Articles
          </Link>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <h3 className="mb-1 font-bold text-white">Company</h3>
          <Link className="hover:text-white" href="/about">
            About us
          </Link>
          <Link className="hover:text-white" href="/contact">
            Contact
          </Link>
          <Link className="hover:text-white" href="/faq">
            FAQs
          </Link>
        </div>
        <div className="hidden flex-col gap-3 text-sm md:flex">
          <h3 className="mb-1 font-bold text-white">Legal</h3>
          <Link className="hover:text-white" href="/privacy">
            Privacy policy
          </Link>
          <Link className="hover:text-white" href="/terms">
            Terms & conditions
          </Link>
        </div>
      </div>
      <div className="mx-auto w-[min(1180px,calc(100%-40px))] border-t border-slate-700 py-5 text-xs">
        © 2026 Certify. All rights reserved.
      </div>
    </footer>
  );
}
