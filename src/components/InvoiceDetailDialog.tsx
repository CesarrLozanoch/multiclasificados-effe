import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Info } from "lucide-react";
import { formatSoles } from "@/lib/pricing";
import { personKindLabel, docKindLabel, factilizaRows } from "@/lib/identity";
import { leerObservaciones } from "@/lib/observacionesSunat";

// Datos mínimos comunes a la boleta del usuario (DbInvoice) y del admin (AdminInvoice).
export interface InvoiceDetailData {
  number: string;
  type: string;            // boleta | factura
  date: string;
  advertiser: string;      // nombre / razón social de Factiliza
  docType: string | null;
  docNumber: string | null;
  factilizaData?: Record<string, unknown> | null;
  email: string;
  listingTitle: string;
  amount: number;
  /** Anulación (0101/0102). Solo se muestran si el comprobante está anulado. */
  anuladoAt?: string | null;
  anuladoMotivo?: string | null;
  notaNumber?: string | null;
  /**
   * Observaciones que SUNAT dejó en el CDR al aceptar el comprobante.
   *
   * Opcional a propósito: esto es un asunto interno (suele hablar de la
   * configuración del emisor, no de la venta) y solo lo pasa el panel de
   * administración. Al anunciante no le aporta nada y la palabra «observado»
   * le haría pensar que su comprobante tiene un problema — no lo tiene.
   */
  sunatNotas?: string[] | null;
}

// Modal "Ver": muestra TODOS los datos del comprobante, incluidos los traídos de
// Factiliza (nombre, DNI/RUC y tipo Usuario/Empresa). Se usa igual en el panel de
// administración y en la vista del usuario (móvil incluido).
export function InvoiceDetailDialog({ invoice, onClose }: { invoice: InvoiceDetailData | null; onClose: () => void }) {
  const rows: Array<[string, string]> = invoice
    ? [
        ["N° Comprobante", invoice.number],
        ["Tipo de comprobante", invoice.type],
        ["Fecha", new Date(invoice.date).toLocaleString("es-PE")],
        ["Nombre / Razón social", invoice.advertiser || "—"],
        ["Tipo", personKindLabel(invoice.docType, invoice.docNumber)],
        [docKindLabel(invoice.docType, invoice.docNumber), invoice.docNumber || "—"],
        // Ficha de Factiliza (domicilio, ubigeo, estado del RUC, etc.), si la hay.
        ...factilizaRows(invoice.docType, invoice.factilizaData),
        ["Correo", invoice.email || "—"],
        ["Aviso", invoice.listingTitle || "—"],
        // La anulación solo aparece cuando la hay: un comprobante vivo no tiene
        // por qué enseñar filas vacías.
        ...(invoice.anuladoAt
          ? ([
              ["Anulado el", new Date(invoice.anuladoAt).toLocaleString("es-PE")],
              ["Motivo de la anulación", invoice.anuladoMotivo || "—"],
              ...(invoice.notaNumber ? [["Nota de crédito", invoice.notaNumber]] : []),
            ] as Array<[string, string]>)
          : []),
      ]
    : [];

  const observaciones = leerObservaciones(invoice?.sunatNotas ?? []);

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={16} className="text-secondary" /> Detalle del comprobante
          </DialogTitle>
          <DialogDescription className="sr-only">Datos completos de la boleta</DialogDescription>
        </DialogHeader>
        {invoice && (
          <div className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
                <span className="text-sm font-medium text-foreground text-right break-words capitalize">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Monto</span>
              <span className="text-base font-extrabold text-primary">{formatSoles(invoice.amount)}</span>
            </div>
          </div>
        )}

        {/* Las observaciones de SUNAT, si las hubo. Van fuera de la lista de
            datos y al final: no son un dato del comprobante, son una nota sobre
            su emisión, y quien abre este modal viene casi siempre a mirar otra
            cosa. */}
        {observaciones.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-left
                          dark:border-amber-900 dark:bg-amber-950/40">
            <p className="flex items-start gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
              <Info size={15} className="mt-0.5 shrink-0" />
              {/* Lo primero, y en negrita: se emitió. La etiqueta ámbar de la
                  tabla, sola, se lee como un fallo. */}
              Emitida y aceptada por SUNAT, con {observaciones.length === 1 ? "una observación" : `${observaciones.length} observaciones`}
            </p>
            <ul className="mt-2 space-y-2">
              {observaciones.map((o) => (
                <li key={o.crudo}>
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    {o.resumen}
                    {o.codigo && (
                      <span className="ml-1 text-xs font-normal opacity-60">(código {o.codigo})</span>
                    )}
                  </p>
                  {o.explicacion && (
                    <p className="mt-0.5 text-xs leading-snug text-amber-800/90 dark:text-amber-200/80">
                      {o.explicacion}
                    </p>
                  )}
                  {/* El texto original, para quien tenga que reclamarlo o
                      buscarlo en el catálogo de SUNAT. Pequeño y monoespaciado:
                      está disponible sin robarle sitio a lo que se entiende. */}
                  <p className="mt-1 break-words font-mono text-[10px] leading-tight text-amber-700/70 dark:text-amber-300/50">
                    {o.crudo}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
