import { getT } from "@/i18n/server";
import { LinkButton } from "@/components/ui/buttons";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="mb-3 text-3xl font-bold">{t.notFound.title}</h1>
      <p className="mb-6">{t.notFound.body}</p>
      <LinkButton href="/">{t.notFound.home}</LinkButton>
    </div>
  );
}
