import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * SABER QUÉ HAY EN UN PUNTO DEL MAPA, y por qué no se hace con el servicio web.
 *
 * ── EL FALLO, REPORTADO POR EL CLIENTE EL 2026-09-04 ─────────────────────────
 *
 * Buscó «españa», el mapa saltó a Madrid… y el País se quedó en Perú, salió «No
 * pudimos identificar esa zona» y el formulario siguió pidiendo un departamento
 * peruano. Publicar desde el extranjero era imposible.
 *
 * La causa no estaba en el formulario: `ubicacionDeCoordenadas` llamaba a
 * `https://maps.googleapis.com/maps/api/geocode/json`, y ese servicio contesta
 * SIEMPRE, comprobado contra el servicio real:
 *
 *     REQUEST_DENIED
 *     "API keys with referer restrictions cannot be used with this API."
 *
 * Es una propiedad de la LLAVE, no de la petición: da igual el dominio, la
 * cabecera `Referer` o dónde caiga el punto —se probó en Lima y en Madrid, con
 * y sin cabecera, y responde lo mismo—. Y la llave del navegador TIENE que ir
 * restringida por dominio: viaja horneada en el bundle, a la vista de cualquiera.
 *
 * O sea que marcar un punto en el mapa NUNCA funcionó en producción. En el Perú
 * se disimulaba (el anunciante elegía el departamento a mano); fuera del Perú
 * era un muro, porque el país tampoco llegaba nunca.
 *
 * El geocodificador del SDK sí funciona con esa llave: va por el mismo canal que
 * el mapa. Misma información, misma facturación, otra puerta.
 */

const geocode = vi.fn();
const cargarGeocodificador = vi.fn();
vi.mock("@/lib/googleMaps", () => ({
  cargarGeocodificador: (...a: unknown[]) => cargarGeocodificador(...a),
}));

const fetchMock = vi.fn();

async function cargar(conLlave = true) {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", conLlave ? "llave-de-prueba" : "");
  return import("@/lib/geocode");
}

/** Forma real de un resultado del SDK: `long_name`/`short_name`. */
const MADRID = {
  results: [
    {
      address_components: [
        { long_name: "Madrid", short_name: "Madrid", types: ["locality", "political"] },
        { long_name: "Madrid", short_name: "M", types: ["administrative_area_level_2", "political"] },
        { long_name: "Comunidad de Madrid", short_name: "MD", types: ["administrative_area_level_1", "political"] },
        { long_name: "España", short_name: "ES", types: ["country", "political"] },
      ],
    },
  ],
};

const LIMA = {
  results: [
    {
      address_components: [
        { long_name: "Miraflores", short_name: "Miraflores", types: ["locality", "political"] },
        { long_name: "Lima", short_name: "Lima", types: ["administrative_area_level_2", "political"] },
        { long_name: "Provincia de Lima", short_name: "Lima", types: ["administrative_area_level_1", "political"] },
        { long_name: "Perú", short_name: "PE", types: ["country", "political"] },
      ],
    },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  geocode.mockReset();
  cargarGeocodificador.mockReset().mockResolvedValue({ geocode: (...a: unknown[]) => geocode(...a) });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("qué hay en un punto del mapa", () => {
  it("🔴 NO llama al servicio web de Geocoding — con nuestra llave siempre da REQUEST_DENIED", async () => {
    // Esta es LA prueba. Si alguien vuelve a `fetch(maps/api/geocode/json)`
    // porque «es más simple», el mapa deja de deducir nada y falla en silencio:
    // el `catch` se traga el REQUEST_DENIED y el usuario solo ve que le piden
    // el departamento a mano.
    const { ubicacionDeCoordenadas } = await cargar();
    geocode.mockResolvedValue(LIMA);

    await ubicacionDeCoordenadas(-12.1219, -77.0297);

    expect(cargarGeocodificador).toHaveBeenCalled();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("maps/api/geocode/json"))).toEqual([]);
  });

  it("dentro del Perú devuelve región, referencia y país", async () => {
    const { ubicacionDeCoordenadas } = await cargar();
    geocode.mockResolvedValue(LIMA);

    const r = await ubicacionDeCoordenadas(-12.1219, -77.0297);

    expect(r.pais).toBe("PE");
    expect(r.region).toBe("Provincia de Lima");
    expect(r.referencia).toBe("Miraflores, Lima");
  });

  it("🔴 fuera del Perú devuelve el PAÍS, que es lo que faltaba", async () => {
    // Sin esto, el aviso en Madrid se quedaba archivado como peruano.
    const { ubicacionDeCoordenadas } = await cargar();
    geocode.mockResolvedValue(MADRID);

    const r = await ubicacionDeCoordenadas(40.4636, -3.7492);

    expect(r.pais).toBe("ES");
    expect(r.referencia).toBe("Madrid");
  });

  it("le pasa el punto tal cual al geocodificador", async () => {
    const { ubicacionDeCoordenadas } = await cargar();
    geocode.mockResolvedValue(LIMA);

    await ubicacionDeCoordenadas(-12.1219, -77.0297);

    expect(geocode).toHaveBeenCalledWith({ location: { lat: -12.1219, lng: -77.0297 } });
  });

  it("si el geocodificador falla, no revienta: devuelve vacío", async () => {
    // `ZERO_RESULTS` llega como excepción (en medio del mar no hay nada), y un
    // corte de red también. Ni uno ni otro pueden tumbar el formulario.
    const { ubicacionDeCoordenadas } = await cargar();
    geocode.mockRejectedValue(new Error("ZERO_RESULTS"));

    expect(await ubicacionDeCoordenadas(0, 0)).toEqual({ region: null, referencia: null, pais: null });
  });

  it("sin llave de Google ni se intenta", async () => {
    const { ubicacionDeCoordenadas } = await cargar(false);

    expect(await ubicacionDeCoordenadas(-12, -77)).toEqual({ region: null, referencia: null, pais: null });
    expect(cargarGeocodificador).not.toHaveBeenCalled();
  });
});

describe("el respaldo de sugerencias tampoco usa el servicio web", () => {
  it("va por el SDK, acotado al país que se le pida", async () => {
    // Este respaldo solo entra si Places no está habilitada. Tenía el mismo
    // fallo: era código muerto que fallaba en silencio.
    const { sugerirDirecciones } = await cargar();
    // Places responde que no está habilitada → se cae al respaldo.
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });
    geocode.mockResolvedValue({
      results: [{ place_id: "ChIJ-x", formatted_address: "Gran Vía, Madrid, España", address_components: [] }],
    });

    const r = await sugerirDirecciones("gran via", { pais: "ES" });

    expect(cargarGeocodificador).toHaveBeenCalled();
    expect(geocode).toHaveBeenCalledWith(
      expect.objectContaining({ componentRestrictions: { country: "ES" } }),
    );
    expect(r[0]?.titulo).toContain("Gran Vía");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("maps/api/geocode/json"))).toEqual([]);
  });
});
