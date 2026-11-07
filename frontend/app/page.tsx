import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BookOpen, Check, Layers3, Network, Search, Terminal } from "lucide-react";
import { ExamCard } from "@/components/exam-card";
import { PracticePreview } from "@/components/practice-preview";
import { ServiceArtwork } from "@/components/service-artwork";
import { HomeStats } from "@/components/home-stats";
import { HomeNotifications } from "@/components/home-notifications";
import { HomeFinalCta } from "@/components/home-final-cta";
import { publicBanners } from "@/lib/banners";
import { publicExams } from "@/lib/exams";
import { publicLabCount } from "@/lib/labs";
import { providerCatalog } from "@/lib/certification-providers";

export default async function Home() {
  const [result, labCount, banners] = await Promise.all([
    publicExams().then(exams => ({ exams, available: true })).catch(() => ({ exams: [], available: false })),
    publicLabCount().catch(() => null),
    publicBanners().catch(() => []),
  ]);
  const { exams, available } = result;
  const providers = providerCatalog(exams.map(exam => exam.category));
  const featured = [...exams].sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 3);
  return <div className="portal-home">
    <HomeNotifications notifications={banners} />
    <section className="portal-hero"><div className="portal-container portal-hero-grid">
      <div className="portal-hero-copy"><p className="portal-eyebrow"><span /> PRACTICE WITH PURPOSE</p><h1>Prepare for the exam.<br /><em>Practice for the job.</em></h1><p className="portal-hero-description">Build confidence in the skills behind your certification. Work through focused practice exams and hands-on labs, at your own pace.</p>
        <form className="portal-search" action="/exams" method="get"><Search size={20} aria-hidden="true" /><input name="q" aria-label="Search exams by title" placeholder="Which exam are you preparing for?" /><button type="submit">Find my exam <ArrowRight size={17} /></button></form>
        <div className="portal-hero-links"><a href="#certifications">Browse certifications <ArrowRight size={15} /></a><Link href="/labs">Explore hands-on labs <ArrowRight size={15} /></Link></div>
      </div><div className="portal-hero-visual"><Image src="/hero-learning.svg" width={720} height={600} priority alt="Illustration of networking, cybersecurity and cloud learning paths alongside a hands-on lab" /></div>
    </div></section>
    <section id="certifications" className="portal-section portal-container"><div className="portal-section-heading"><div><p className="portal-eyebrow">FIND YOUR DIRECTION</p><h2>One place. Your certification path.</h2><p>Explore the providers in our certification directory.</p></div><Link className="portal-text-link" href="/exams">Browse all exams <ArrowUpRight size={18} /></Link></div>
      <div className="provider-grid">{providers.map(provider => <Link key={provider.name} href={provider.href} className="provider-card" aria-label={`View ${provider.name} exams${available ? `, ${provider.count} published` : ""}`}><span className="provider-card-logo"><span className={`provider-wordmark provider-${provider.aliases[0]}`}>{provider.mark}</span></span><strong className="provider-card-name">{provider.name}</strong><span className="provider-card-cta">View exams <ArrowRight size={11} aria-hidden="true" /></span></Link>)}</div>
      <p className="provider-note">Our directory covers these certification providers. Available practice content is listed in each catalog.</p>
    </section>
    <section className="portal-section portal-container portal-services"><div className="portal-section-heading"><div><p className="portal-eyebrow">WHAT WE OFFER</p><h2>Services</h2><p>Find your focus, put knowledge to work and see how far you have come.</p></div></div>
      <div className="portal-services-grid">{([
        { kind: "paths", label: "01 / FIND YOUR FOCUS", title: "Certification paths", description: "Explore providers and find the exam that fits your next goal.", href: "#certifications" },
        { kind: "exams", label: "02 / BUILD CONFIDENCE", title: "Practice exams", description: "Work through exam-style questions in practice or timed mode.", href: "/exams" },
        { kind: "labs", label: "03 / LEARN BY DOING", title: "Hands-on labs", description: "Configure simulated devices and check your work against focused tasks.", href: "/labs" },
        { kind: "progress", label: "04 / SEE YOUR GROWTH", title: "Results & progress", description: "Review your attempts and decide what to practice next.", href: "/dashboard" },
      ] as const).map(service => <Link className="portal-service-card" href={service.href} key={service.kind}><div className="portal-service-art"><ServiceArtwork kind={service.kind} /></div><div className="portal-service-copy"><span>{service.label}</span><div><h3>{service.title}</h3><ArrowUpRight size={19} aria-hidden="true" /></div><p>{service.description}</p></div></Link>)}</div>
    </section>
    <HomeStats stats={[
      { kind: "exams", label: "Published exams", value: available ? exams.length : null },
      { kind: "questions", label: "Practice questions", value: available ? exams.reduce((sum, exam) => sum + exam.questionCount, 0) : null },
      { kind: "labs", label: "Hands-on labs", value: labCount },
      { kind: "providers", label: "Providers in directory", value: providers.length },
    ]} />
    <section className="portal-container portal-preview-section"><div className="portal-preview-intro"><p className="portal-eyebrow">SEE HOW IT WORKS</p><h2>Try the experience before you begin.</h2><p>Answer a practice question or take a look at the simulated lab workspace. No account is needed to explore this preview.</p><Link href="/exams" className="portal-text-link">Browse practice exams <ArrowUpRight size={18} /></Link></div><PracticePreview /></section>
    <section className="portal-featured-section"><div className="portal-container portal-section"><div className="portal-section-heading"><div><p className="portal-eyebrow">START WITH A QUESTION</p><h2>Your next exam starts here.</h2><p>Choose a practice exam and make your next study session count.</p></div><Link className="portal-text-link" href="/exams">All practice exams <ArrowUpRight size={18} /></Link></div>
      {featured.length ? <div className="portal-featured-grid">{featured.map(exam => <ExamCard key={exam.id} exam={exam} />)}</div> : <div className="portal-empty"><BookOpen size={28} /><h3>{available ? "Your exam library is taking shape." : "The exam library is temporarily unavailable."}</h3><p>{available ? "Published practice exams will appear here. Explore our labs in the meantime." : "Please visit the catalog to try again."}</p><Link className="portal-button" href={available ? "/labs" : "/exams"}>{available ? "Explore labs" : "Open exam catalog"}</Link></div>}
    </div></section>
    <section className="portal-section portal-container"><div className="portal-lab-feature"><div><p className="portal-eyebrow">HANDS-ON, NOT HANDS-OFF</p><h2>Knowing the answer is one thing.<br />Doing it is another.</h2><p>Step into a simulated lab. Configure devices, work through tasks and check your results in one focused workspace.</p><ul><li><Check size={16} />Guided tasks and reference solutions</li><li><Check size={16} />Practice and timed assessment modes</li><li><Check size={16} />Saved sessions to pick up where you left off</li></ul><Link href="/labs" className="portal-button portal-button-yellow">Explore hands-on labs <ArrowRight size={17} /></Link></div><div className="lab-feature-diagram" aria-label="Illustration of a simulated network"><div className="lab-diagram-caption"><span />SIMULATED LAB ENVIRONMENT</div><div className="lab-diagram-nodes"><span><Network size={34} /><b>Router</b></span><i /><span><Layers3 size={34} /><b>Switch</b></span><i /><span><Terminal size={34} /><b>Console</b></span></div><div className="lab-diagram-task"><span>01</span><div><strong>Configure. Verify. Understand.</strong><p>A workspace built around the task.</p></div><Check size={18} /></div><p className="lab-diagram-note">Configuration simulation · Not a live device environment</p></div></div></section>
    <section className="portal-container portal-section portal-method"><div className="portal-section-heading"><div><p className="portal-eyebrow">A CLEAR WAY FORWARD</p><h2>Make preparation a practice.</h2></div><p>No guesswork about where to begin.<br />Just a focused path from practice to progress.</p></div><div className="portal-method-grid">{[["01", "Choose your focus", "Find your certification, select an exam or lab and choose how you want to practice."], ["02", "Work through it", "Take your time in practice mode or challenge yourself with a timed assessment."], ["03", "Learn from the result", "Review the correct answers and return to the areas that need work."]].map(([number, title, text]) => <div key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
    <HomeFinalCta />
  </div>;
}
