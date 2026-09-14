import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { DocumentoLegal } from "@/components/DocumentoLegal";
import { fetchDocumentoLegal, LEGAL_DE_FABRICA, type DocumentoLegalCompleto } from "@/lib/legal";

// Términos y Condiciones del Servicio + Política de Tratamiento de Datos
// Personales de CORP LOZANOCHEFFER SAC (documento único).
//
// EL TEXTO YA NO ESTÁ AQUÍ. Desde la migración 0151 vive en la base de datos y
// se edita desde el panel (Comercial → Términos y privacidad): quien redacta el
// contrato no es quien despliega, y cambiar una coma de una cláusula no puede
// costar un despliegue. Lo que queda en el código es el documento de fábrica,
// en `src/lib/legalPorDefecto.ts`, que es lo que se enseña si la base no
// responde.
//
// Se enseña de DOS formas, con el mismo contenido:
//
//   · `TermsDialog` — el modal de siempre, para leerlo sin salir del registro.
//   · `/terminos` y `/privacidad` (LegalPage) — la misma cosa con dirección
//     propia. Hace falta porque Google Play exige un ENLACE público a la
//     política de privacidad y lo revisa en cada actualización: un documento
//     que solo existe dentro de un modal no se puede enlazar.

/**
 * Carga el documento, empezando por el de fábrica.
 *
 * Se pinta el de fábrica DESDE EL PRIMER RENDER y se sustituye cuando llega el
 * de la base. Ni pantalla en blanco ni «Cargando…»: esta página es la que abre
 * el revisor de Play, y un hueco de medio segundo donde debería estar la
 * política de privacidad no es algo que convenga arriesgar por un detalle de
 * carga.
 */
function useDocumentoLegal(): DocumentoLegalCompleto {
  const [doc, setDoc] = useState<DocumentoLegalCompleto>(LEGAL_DE_FABRICA);

  useEffect(() => {
    let vivo = true;
    fetchDocumentoLegal().then((d) => { if (vivo) setDoc(d); });
    return () => { vivo = false; };
  }, []);

  return doc;
}

/** Contenido completo del documento legal (reutilizable). */
export function LegalTermsContent() {
  const { bloques, actualizado } = useDocumentoLegal();

  return (
    <div className="space-y-5">
      <DocumentoLegal documento={bloques} />
      <p className="text-xs text-muted-foreground">
        Fecha de última actualización: {actualizado}
      </p>
    </div>
  );
}

interface TermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Modal con el documento completo de Términos y Condiciones + Política de Privacidad. */
export function TermsDialog({ open, onOpenChange }: TermsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Términos y Condiciones y Política de Privacidad</DialogTitle>
          <DialogDescription>
            CORP LOZANOCHEFFER SAC — RUC N° 20616009061. Lee el documento completo antes de aceptar.
          </DialogDescription>
        </DialogHeader>
        <LegalTermsContent />
        {/* Para quien quiera guardarlo, imprimirlo o mandárselo a alguien: el
            mismo documento tiene su propia dirección. Un modal no se enlaza. */}
        <Button asChild variant="outline" size="sm" className="gap-1.5 self-start">
          <Link to="/terminos" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Abrir en una pestaña
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
