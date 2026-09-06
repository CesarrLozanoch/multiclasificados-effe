import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { prepararDom } from "./domPolyfills";

/**
 * PUBLICAR UN AVISO FUERA DEL PERÚ.
 *
 * Reportado por el cliente el 2026-09-04: buscó «españa», el mapa saltó a
 * Madrid, pero el País se quedó en **Perú**, salió «No pudimos identificar esa
 * zona» y el formulario siguió exigiendo un **departamento peruano**. Quedaba
 * imposible publicar desde el extranjero.
 *
 * Los datos que se simulan aquí NO son inventados: son los que devuelve de
 * verdad la API de Google para el lugar «España» (`ChIJi7xhMnjjQgwR7KNoB5Qs7KY`),
 * comprobados contra el servicio real —un país no tiene
 * `administrative_area_level_1` ni `locality`, así que `region` y `referencia`
 * llegan vacías y lo ÚNICO que viene es `pais: "ES"`.
 *
 * Y ahí estaba el fallo: al no venir región, se tomaba el camino de «no supe
 * deducir la zona» sin mirar antes que el punto estaba en otro país.
 */

beforeEach(prepararDom);

const mapa: { click?: (e: { latLng: { lat: () => number; lng: () => number } }) => void } = {};

vi.mock("@/lib/googleMaps", async () => {
  const React = await import("react");
  const marcadorFalso = class {
    map: unknown = null;
    position: unknown;
    constructor(o: Record<string, unknown>) { Object.assign(this, o); }
    addListener() { return { remove() {} }; }
  };
  return {
    useMapaDeGoogle: (_o: unknown, alCrear?: (m: unknown, l: unknown) => void) => {
      const contenedor = React.useRef<HTMLDivElement | null>(null);
      const libs = React.useMemo(() => ({ marker: { AdvancedMarkerElement: marcadorFalso } }), []);
      const m = React.useMemo(() => ({
        addListener: (evento: string, cb: (e: unknown) => void) => {
          if (evento === "click") mapa.click = cb as never;
          return { remove() {} };
        },
        panTo: () => {},
        getZoom: () => 16,
        setZoom: () => {},
      }), []);
      React.useEffect(() => { alCrear?.(m, libs); }, [alCrear, m, libs]);
      return { contenedor, mapa: m, libs, estado: "listo" as const };
    },
    textoDeEstadoDelMapa: () => null,
    hayMapasDeGoogle: () => true,
  };
});

const ubicacionDeCoordenadas = vi.fn();
const sugerirDirecciones = vi.fn();
const detalleDeLugar = vi.fn();
vi.mock("@/lib/geocode", () => ({
  ubicacionDeCoordenadas: (...a: unknown[]) => ubicacionDeCoordenadas(...a),
  sugerirDirecciones: (...a: unknown[]) => sugerirDirecciones(...a),
  detalleDeLugar: (...a: unknown[]) => detalleDeLugar(...a),
  nuevaSesionDeBusqueda: () => "sesion-de-prueba",
}));

import { LocationPicker } from "@/components/LocationPicker";

/** Envoltorio con estado, como el formulario de publicar: incluye el PAÍS. */
function Formulario() {
  const [department, setDepartment] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("PE");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  return (
    <>
      <LocationPicker
        department={department}
        onDepartmentChange={setDepartment}
        country={country}
        onCountryChange={setCountry}
        location={location}
        onLocationChange={setLocation}
        lat={coords?.lat ?? null}
        lng={coords?.lng ?? null}
        onCoordsChange={(la, ln) => setCoords(la != null && ln != null ? { lat: la, lng: ln } : null)}
        required
      />
      <output data-testid="valores">
        {`pais=${country}|dep=${department ?? "—"}|ref=${location || "—"}`}
      </output>
    </>
  );
}

const valores = () => screen.getByTestId("valores").textContent ?? "";

/** Lo que Google devuelve de verdad para el lugar «España». */
const ESPANA = { lat: 40.463667, lng: -3.74922, region: null, referencia: null, pais: "ES" };

/** Busca «españa» en el cuadro y elige la sugerencia, como hizo el cliente. */
const buscarEspana = async () => {
  sugerirDirecciones.mockResolvedValue([{ id: "ChIJi7xhMnjjQgwR7KNoB5Qs7KY", titulo: "España" }]);
  detalleDeLugar.mockResolvedValue(ESPANA);

  const caja = screen.getByPlaceholderText(/busca|direcci|calle/i);
  fireEvent.change(caja, { target: { value: "españa" } });
  const opcion = await screen.findByText("España", {}, { timeout: 3000 });
  await act(async () => { fireEvent.mouseDown(opcion); });
  await waitFor(() => expect(detalleDeLugar).toHaveBeenCalled());
};

beforeEach(() => {
  ubicacionDeCoordenadas.mockReset().mockResolvedValue({ region: null, referencia: null, pais: null });
  sugerirDirecciones.mockReset().mockResolvedValue([]);
  detalleDeLugar.mockReset().mockResolvedValue(null);
});

describe("un punto fuera del Perú", () => {
  it("🔴 cambia el PAÍS del aviso a España", async () => {
    render(<Formulario />);
    await buscarEspana();
    await waitFor(() => expect(valores()).toContain("pais=ES"));
  });

  it("🔴 NO dice «no pudimos identificar esa zona»", async () => {
    // Es correcto que un país no tenga departamento: no hay nada que deducir.
    // Ese mensaje, ahí, solo confunde — y venía acompañado de exigir un
    // departamento del INEI para un aviso en Madrid.
    render(<Formulario />);
    await buscarEspana();
    await waitFor(() => expect(valores()).toContain("pais=ES"));
    expect(screen.queryByText(/No pudimos identificar esa zona/i)).toBeNull();
  });

  it("🔴 deja de pedir un departamento peruano", async () => {
    render(<Formulario />);
    await buscarEspana();
    await waitFor(() => expect(valores()).toContain("pais=ES"));
    expect(screen.queryByText(/Elige tu departamento/i)).toBeNull();
    expect(valores()).toContain("dep=—");
  });
});

describe("y dentro del Perú no cambia nada", () => {
  it("un punto peruano sigue deduciendo su departamento", async () => {
    ubicacionDeCoordenadas.mockResolvedValue({
      region: "Provincia de Lima", referencia: "Miraflores, Lima", pais: "PE",
    });
    render(<Formulario />);
    await act(async () => {
      mapa.click?.({ latLng: { lat: () => -12.1219, lng: () => -77.0297 } });
    });
    await waitFor(() => expect(valores()).toContain("ref=Miraflores, Lima"));
    expect(valores()).toContain("pais=PE");
    expect(valores()).not.toContain("dep=—");
  });

  it("y si Google no reconoce la zona DENTRO del Perú, sí se piden los campos", async () => {
    // El aviso de «no pudimos identificar» tiene que seguir saliendo donde sirve:
    // un punto peruano sin departamento no aparece en ninguna búsqueda.
    ubicacionDeCoordenadas.mockResolvedValue({ region: null, referencia: null, pais: "PE" });
    render(<Formulario />);
    await act(async () => {
      mapa.click?.({ latLng: { lat: () => -12.1219, lng: () => -77.0297 } });
    });
    expect(await screen.findByText(/No pudimos identificar esa zona/i)).toBeInTheDocument();
  });
});
