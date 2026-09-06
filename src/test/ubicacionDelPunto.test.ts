import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Deducir el departamento y el distrito del punto que marca el anunciante.
 *
 * Es lo que permite que publicar sea "marca dónde está" y nada más. Si esto
 * falla, el aviso se queda sin departamento y no aparece en NINGUNA búsqueda por
 * ubicación — un fallo silencioso, que nadie ve hasta que el anunciante se queja
 * de que su aviso no sale.
 *
 * Las respuestas de abajo son las que devuelve Google de verdad para esos
 * puntos, copiadas de una consulta real a la API. No están inventadas, porque
 * los nombres no salen donde uno esperaría: el departamento de Lima viene como
 * "Provincia de Lima" en la capital y como "Gobierno Regional de Lima" en el
 * resto, y el Cusco viene con zeta.
 */

vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "llave-de-prueba");

// Va por el geocodificador del SDK y NO por `maps/api/geocode/json`: ese
// servicio web devuelve REQUEST_DENIED con una llave restringida por dominio, y
// la del navegador tiene que estarlo. Comprobado contra el servicio real el
// 2026-09-05; ver `geocodeInversa.test.ts`.
const geocode = vi.fn();
vi.mock("@/lib/googleMaps", () => ({
  cargarGeocodificador: () => Promise.resolve({ geocode: (...a: unknown[]) => geocode(...a) }),
}));

const { ubicacionDeCoordenadas } = await import("@/lib/geocode");

/** Construye la respuesta de Google a partir de sus componentes. */
// Google devuelve el código ISO del país en `short_name`; es de donde sale el
// país del aviso desde que se admiten avisos de fuera del Perú.
const ISO: Record<string, string> = { "Perú": "PE", Peru: "PE", Bolivia: "BO" };

const respuesta = (comp: Record<string, string>) => ({
  results: [{
    address_components: Object.entries(comp).map(([types, long_name]) => ({
      long_name,
      short_name: types === "country" ? (ISO[long_name] ?? long_name) : long_name,
      types: types.split("+"),
    })),
  }],
});

/** Lo que contesta el geocodificador del SDK a la siguiente consulta. */
const responder = (cuerpo: unknown) => geocode.mockResolvedValue(cuerpo);

beforeEach(() => { geocode.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const LIMA = {
  administrative_area_level_1: "Provincia de Lima",
  administrative_area_level_2: "Lima",
  "locality+administrative_area_level_3": "Miraflores",
  country: "Perú",
};
const CHANCAY = {
  administrative_area_level_1: "Gobierno Regional de Lima",
  administrative_area_level_2: "Huaral",
  locality: "Chancay",
  country: "Perú",
};
const CUSCO = {
  administrative_area_level_1: "Cuzco",
  administrative_area_level_2: "Cuzco",
  locality: "Cusco",
  country: "Perú",
};
const TRUJILLO = {
  administrative_area_level_1: "La Libertad",
  administrative_area_level_2: "Trujillo",
  locality: "Trujillo",
  country: "Perú",
};

describe("qué hay en el punto del mapa", () => {
  it("Miraflores → región de Lima y referencia con su provincia", async () => {
    responder(respuesta(LIMA));
    const r = await ubicacionDeCoordenadas(-12.1219, -77.0297);
    expect(r.region).toBe("Provincia de Lima");
    expect(r.referencia).toBe("Miraflores, Lima");
  });

  it("Chancay → la provincia SÍ aporta, porque no es la capital", async () => {
    responder(respuesta(CHANCAY));
    const r = await ubicacionDeCoordenadas(-11.5715, -77.2712);
    expect(r.region).toBe("Gobierno Regional de Lima");
    expect(r.referencia).toBe("Chancay, Huaral");
  });

  it("Cusco → no dice 'Cusco, Cuzco': la zeta y la ese son lo mismo", async () => {
    responder(respuesta(CUSCO));
    const r = await ubicacionDeCoordenadas(-13.5226, -71.9673);
    expect(r.referencia).toBe("Cusco");
  });

  it("Trujillo → no repite el nombre dos veces", async () => {
    responder(respuesta(TRUJILLO));
    const r = await ubicacionDeCoordenadas(-8.1116, -79.0288);
    expect(r.referencia).toBe("Trujillo");
  });

  it("un punto fuera del Perú se acepta, pero diciendo de qué país es", async () => {
    // Antes se descartaba: un aviso no podía estar fuera del Perú. Ahora sí, y
    // el país viaja con el resultado — es lo que impide que "La Paz" acabe
    // archivada como un departamento peruano cualquiera.
    responder(respuesta({
      administrative_area_level_1: "La Paz", locality: "La Paz", country: "Bolivia",
    }));
    const r = await ubicacionDeCoordenadas(-16.5, -68.15);
    expect(r.pais).toBe("BO");
    expect(r.region).toBe("La Paz");
  });

  it("sin resultados devuelve vacío, no revienta", async () => {
    responder({ results: [] });
    expect(await ubicacionDeCoordenadas(0, 0)).toEqual({ region: null, referencia: null, pais: null });
  });

  it("si Google se cae devuelve vacío, no revienta", async () => {
    // `ZERO_RESULTS` y un corte de red llegan los dos como excepción.
    geocode.mockRejectedValue(new Error("sin red"));
    expect(await ubicacionDeCoordenadas(-12, -77)).toEqual({ region: null, referencia: null, pais: null });
  });

  it("pide una sola consulta, no una por dato", async () => {
    responder(respuesta(LIMA));
    await ubicacionDeCoordenadas(-12.1219, -77.0297);
    expect(geocode).toHaveBeenCalledTimes(1);
    // Solo el punto: acotar por tipo de resultado perdería el distrito.
    expect(geocode).toHaveBeenCalledWith({ location: { lat: -12.1219, lng: -77.0297 } });
  });
});

describe("de la región de Google al departamento del catálogo", () => {
  it("reconoce las tres formas raras que devuelve Google", async () => {
    const { departamentoDeTexto } = await import("@/lib/departamentos");
    expect(departamentoDeTexto("Provincia de Lima")?.id).toBe("15");
    expect(departamentoDeTexto("Gobierno Regional de Lima")?.id).toBe("15");
    expect(departamentoDeTexto("Cuzco")?.id).toBe("08");
    expect(departamentoDeTexto("La Libertad")?.id).toBe("13");
  });
});
