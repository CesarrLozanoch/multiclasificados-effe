import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";
import { SelloPagoSeguro } from "@/components/SelloPagoSeguro";

/**
 * El sello de «Pago seguro».
 *
 * Lo que se vigila aquí NO es el aspecto, es lo que AFIRMA. Un sello de
 * seguridad que exagera es peor que no ponerlo: si un cliente lo comprueba y no
 * cuadra, el daño es a la confianza en todo lo demás — y esto se le enseña justo
 * cuando está decidiendo si nos manda dinero.
 *
 * El caso que más importa es el de Yape y Plin: ahí Izipay NO interviene, así
 * que nombrarlo sería falso. Es fácil que alguien «unifique» las dos variantes
 * en una sola por parecerse mucho, y entonces la mentira entra sin que nadie la
 * vea. Esta prueba existe para que eso falle en rojo.
 */
beforeEach(prepararDom);

describe("pagando con tarjeta", () => {
  it("dice quién procesa el pago y que los datos no pasan por nosotros", () => {
    render(<SelloPagoSeguro />);
    expect(screen.getByText(/Pago 100 % seguro/)).toBeInTheDocument();
    expect(screen.getByText(/Izipay/)).toBeInTheDocument();
    expect(screen.getByText(/no pasan por nuestros servidores/)).toBeInTheDocument();
  });

  it("no promete 3D Secure ni verificación del banco", () => {
    // Depende del banco emisor y de la configuración de la tienda, no de
    // nosotros. Y con Izipay rechazando los pagos con tarjeta desde el 4-sep
    // por un cambio suyo en el 3DS, prometerlo sería especialmente desafortunado.
    const { container } = render(<SelloPagoSeguro />);
    expect(container.textContent).not.toMatch(/3-?D\s*Secure/i);
    expect(container.textContent).not.toMatch(/verificado por (tu|su) banco/i);
  });
});

describe("pagando por Yape o Plin", () => {
  it("NO menciona a Izipay, porque ahí no interviene", () => {
    const { container } = render(<SelloPagoSeguro medio="billetera" nombre="Yape" />);
    expect(container.textContent).not.toMatch(/izipay/i);
  });

  it("nombra la app con la que se paga", () => {
    const { container } = render(<SelloPagoSeguro medio="billetera" nombre="Plin" />);
    expect(container.textContent).toContain("Plin");
  });

  it("avisa de que nunca se pide la clave", () => {
    // La estafa habitual con billeteras en Perú es justo la llamada pidiendo la
    // clave o el código de verificación. Decirlo aquí es lo útil del sello.
    const { container } = render(<SelloPagoSeguro medio="billetera" nombre="Yape" />);
    expect(container.textContent).toContain("Nunca te pedimos tu clave");
    // Y una sola vez: repetirlo dentro del mismo recuadro es ruido, y gasta el
    // sitio del único dato que si no falta — que esto lo aprueba una persona.
    expect(container.textContent!.match(/Nunca te pedimos tu clave/g)).toHaveLength(1);
    expect(container.textContent).toContain("Lo confirma nuestro equipo");
  });

  it("no dice que los datos de la tarjeta viajen cifrados: no hay tarjeta", () => {
    const { container } = render(<SelloPagoSeguro medio="billetera" nombre="Yape" />);
    expect(container.textContent).not.toMatch(/tarjeta/i);
  });

  it("aguanta sin nombre, por si la configuración llega a medias", () => {
    const { container } = render(<SelloPagoSeguro medio="billetera" />);
    expect(container.textContent).toContain("tu billetera");
  });
});

describe("la línea del pie", () => {
  it("dice lo que corresponde a cada medio", () => {
    const tarjeta = render(<SelloPagoSeguro variante="linea" />);
    expect(tarjeta.container.textContent).toMatch(/Izipay/);
    tarjeta.unmount();

    const yape = render(<SelloPagoSeguro variante="linea" medio="billetera" nombre="Yape" />);
    expect(yape.container.textContent).not.toMatch(/izipay/i);
    expect(yape.container.textContent).toContain("Yape");
  });
});

describe("está donde se paga, no solo en un sitio", () => {
  it("las tres pantallas de pago lo montan", async () => {
    // Se comprueba sobre el código y no renderizando cada pantalla: montar el
    // modal de compra entero exige una sesión, la configuración de Yape y el
    // formulario de Izipay. Lo que aquí se quiere fijar es más simple —que
    // ninguna de las tres se quede sin sello— y eso se ve leyendo.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raiz = path.resolve(__dirname, "..");

    for (const [fichero, medio] of [
      ["components/BuyCreditsModal.tsx", "tarjeta"],   // web
      ["pages/PaymentPage.tsx", "tarjeta"],            // navegador del sistema (APK)
      ["components/PagoManualPanel.tsx", "billetera"], // Yape y Plin
    ] as const) {
      const src = fs.readFileSync(path.join(raiz, fichero), "utf8");
      expect(src, `${fichero} no monta el sello`).toContain("<SelloPagoSeguro");
      if (medio === "billetera") {
        expect(src, `${fichero} debe usar la variante de billetera`)
          .toContain('medio="billetera"');
      }
    }
  });
});
