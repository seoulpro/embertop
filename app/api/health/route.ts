export const dynamic = "force-dynamic";

export function GET() {
  const hasUpstream = Boolean(
    process.env.EMBERTOP_UPSTREAM_URL?.trim(),
  );
  return Response.json(
    {
      ok: true,
      service: "embertop",
      mode: hasUpstream ? "upstream" : "local",
      now: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
