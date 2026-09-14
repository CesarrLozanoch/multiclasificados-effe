// Los Términos y la Política de Privacidad, con dirección propia.
//
// POR QUÉ EXISTE ESTA PANTALLA
//
// El documento ya estaba escrito y completo, pero vivía SOLO dentro de un modal
// (`TermsDialog`, en la portada, el registro y Ajustes). Google Play exige un
// ENLACE público a la política de privacidad —lo pide al crear la ficha y lo
// vuelve a revisar en cada actualización—, y un texto que solo se ve abriendo un
// diálogo no se puede enlazar: no hay ninguna dirección que pegar.
//
// El contenido no se duplica. Es el mismo `LegalTermsContent` que usa el modal,
// así que no pueden acabar diciendo cosas distintas.
//
// PÚBLICA DE VERDAD: sin sesión, sin capas por encima. Quien abra el enlace —un
// revisor de Play, un usuario que quiere saber qué se hace con su DNI— tiene que
// llegar al texto y punto.
//
// Dos direcciones para un solo documento (Términos y Política son un documento
// único, así lo redactó el abogado):
//   · /terminos   — entra por el principio
//   · /privacidad — baja hasta el tratamiento de datos, que es lo que se le da
//                   a Play y lo que busca quien llega por ahí
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LegalTermsContent } from "@/components/LegalTerms";

export default function LegalPage() {
  const { pathname } = useLocation();
  const esPrivacidad = pathname.startsWith("/privacidad");

  useEffect(() => {
    document.title = esPrivacidad
      ? "Política de Privacidad · eFFe Multiclasificados"
      : "Términos y Condiciones · eFFe Multiclasificados";
  }, [esPrivacidad]);

  useEffect(() => {
    if (!esPrivacidad) return;
    // Quien llega por /privacidad viene a por el tratamiento de datos, no a
    // leerse el contrato entero. Se baja hasta esa cláusula.
    //
    // SE REINTENTA, y no basta con un `requestAnimationFrame`. Desde la 0151 el
    // documento se carga de la base: en el primer render está el de fábrica
    // —que ya trae el ancla, así que el primer intento suele acertar— pero
    // cuando llega el de la base el contenido se sustituye entero y la posición
    // se pierde. Reintentar durante un par de segundos cubre las dos cosas sin
    // tener que enterarse de cuándo terminó la carga.
    //
    // Se para en cuanto el usuario toca la rueda: si ya está leyendo donde
    // quiere, saltarle la página debajo del dedo es de las cosas más molestas
    // que puede hacer una web.
    let tocado = false;
    const alTocar = () => { tocado = true; };
    window.addEventListener("wheel", alTocar, { passive: true, once: true });
    window.addEventListener("touchstart", alTocar, { passive: true, once: true });

    const hasta = Date.now() + 2500;
    const t = setInterval(() => {
      if (tocado || Date.now() > hasta) { clearInterval(t); return; }
      document.getElementById("datos-personales")
        ?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 120);

    return () => {
      clearInterval(t);
      window.removeEventListener("wheel", alTocar);
      window.removeEventListener("touchstart", alTocar);
    };
  }, [esPrivacidad]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
            <Link to="/"><ArrowLeft size={15} /> Volver al inicio</Link>
          </Button>
          {/* Un documento legal se guarda y se imprime. La hoja sale limpia:
              los controles llevan `print:hidden`. */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 print:hidden"
            onClick={() => window.print()}
          >
            <Printer size={14} /> Imprimir o guardar en PDF
          </Button>
        </div>

        <header className="mb-8 border-b pb-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Términos y Condiciones y Política de Privacidad
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            CORP LOZANOCHEFFER SAC — RUC N° 20616009061
          </p>
        </header>

        <LegalTermsContent />
      </div>
    </main>
  );
}
