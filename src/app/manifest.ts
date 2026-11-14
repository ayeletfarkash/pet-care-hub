import type { MetadataRoute } from "next";
import { getT } from "@/i18n/server";
import { dirOf } from "@/i18n";

// PWA manifest (PRD §12.3): installable on phones, which iOS requires for push notifications.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t, locale } = await getT();
  return {
    name: t.app.name,
    short_name: t.app.name,
    description: t.app.tagline,
    lang: locale,
    dir: dirOf(locale),
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#9a3412",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
