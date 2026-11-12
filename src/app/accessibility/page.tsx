import { formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { statement, STATEMENT_UPDATED } from "@/content/accessibility-statement";

export async function generateMetadata() {
  const { locale } = await getT();
  return { title: statement[locale].title };
}

// Public page: reachable from the footer and the accessibility toolbar (PRD §20.1).
export default async function AccessibilityPage() {
  const { locale } = await getT();
  const s = statement[locale];
  const contactEmail = process.env.ACCESSIBILITY_CONTACT_EMAIL;
  const h2 = "mb-2 mt-8 text-2xl font-bold";

  return (
    <article className="prose-links mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">{s.title}</h1>
      <p className="mt-1 text-muted">
        {s.updated}: <time dateTime={STATEMENT_UPDATED}>{formatDate(locale, STATEMENT_UPDATED)}</time>
      </p>

      <h2 className={h2}>{s.commitmentH}</h2>
      <p>{s.commitment}</p>

      <h2 className={h2}>{s.standardH}</h2>
      <p>{s.standard}</p>

      <h2 className={h2}>{s.featuresH}</h2>
      <ul className="list-disc space-y-1 ps-6">{s.features.map((f) => <li key={f}>{f}</li>)}</ul>

      <h2 className={h2}>{s.testingH}</h2>
      <ul className="list-disc space-y-1 ps-6">{s.testing.map((f) => <li key={f}>{f}</li>)}</ul>

      <h2 className={h2}>{s.limitationsH}</h2>
      <ul className="list-disc space-y-1 ps-6">{s.limitations.map((f) => <li key={f}>{f}</li>)}</ul>

      <h2 className={h2}>{s.contactH}</h2>
      {contactEmail ? (
        <p>{s.contact} <a href={`mailto:${contactEmail}`} className="ltr-value">{contactEmail}</a></p>
      ) : (
        <p>{s.contactMissing}</p>
      )}

      <p className="mt-8 rounded-xl bg-accent p-4 text-sm">{s.legal}</p>
    </article>
  );
}
