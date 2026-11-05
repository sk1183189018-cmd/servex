export const dynamic = "force-dynamic";

/** Liveness check for hosting platforms and CI smoke tests. Returns no business data. */
export function GET() {
  return Response.json({ status: "ok", service: "servex-web" });
}
