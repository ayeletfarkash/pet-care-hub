import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** App icon (PWA manifest, Apple touch icon): a paw drawn with shapes, so no font or emoji is fetched. */
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const u = size / 16; // grid unit; the paw stays inside the maskable safe zone (centre 80%)
  const toe = (x: number, y: number) => <div style={{ position: "absolute", left: x * u, top: y * u, width: 2.6 * u, height: 3.2 * u, borderRadius: "50%", background: "#fff" }} />;
  return new ImageResponse(
    <div style={{ width: size, height: size, background: "#9a3412", display: "flex", position: "relative" }}>
      {toe(3.6, 5.6)}{toe(5.9, 3.6)}{toe(8.9, 3.6)}{toe(11.2, 5.6)}
      <div style={{ position: "absolute", left: 5 * u, top: 7.8 * u, width: 6 * u, height: 4.8 * u, borderRadius: "45%", background: "#fff" }} />
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
