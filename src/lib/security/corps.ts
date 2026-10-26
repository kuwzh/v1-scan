export type ResultatCorps<T> =
  { ok: true; valeur: T } | { ok: false; raison: "trop_gros" | "illisible" };

/**
 * Lit le corps d'une requête en s'arrêtant dès que `max` octets sont dépassés : on ne se fie
 * pas à `Content-Length` (absent ou menteur), et on n'accumule jamais plus que la limite.
 */
async function lireOctets(request: Request, max: number): Promise<Uint8Array | "trop_gros"> {
  const annonce = Number(request.headers.get("content-length"));
  if (Number.isFinite(annonce) && annonce > max) return "trop_gros";
  if (!request.body) return new Uint8Array(0);

  const lecteur = request.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lecteur.cancel().catch(() => {});
      return "trop_gros";
    }
    morceaux.push(value);
  }
  const octets = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) {
    octets.set(m, position);
    position += m.byteLength;
  }
  return octets;
}

export async function lireFormData(
  request: Request,
  max: number,
): Promise<ResultatCorps<FormData>> {
  const octets = await lireOctets(request, max);
  if (octets === "trop_gros") return { ok: false, raison: "trop_gros" };
  try {
    const type = request.headers.get("content-type") ?? "";
    return {
      ok: true,
      valeur: await new Response(octets as BodyInit, {
        headers: { "content-type": type },
      }).formData(),
    };
  } catch {
    return { ok: false, raison: "illisible" };
  }
}

export async function lireJson(request: Request, max: number): Promise<ResultatCorps<unknown>> {
  const octets = await lireOctets(request, max);
  if (octets === "trop_gros") return { ok: false, raison: "trop_gros" };
  try {
    return { ok: true, valeur: JSON.parse(new TextDecoder().decode(octets)) as unknown };
  } catch {
    return { ok: false, raison: "illisible" };
  }
}
