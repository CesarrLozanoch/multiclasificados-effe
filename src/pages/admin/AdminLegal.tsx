import { useEffect, useMemo, useState } from "react";
import { Save, RotateCcw, AlertCircle, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditorDeDocumento } from "@/components/EditorDeDocumento";
import { DocumentoLegal } from "@/components/DocumentoLegal";
import { toast } from "@/hooks/use-toast";
import { setSetting } from "@/lib/admin";
import { mensajeDeError } from "@/lib/errores";
import { textoPlano, MAX_BLOQUES, type Documento } from "@/lib/documentoLegal";
import {
  fetchDocumentoLegal, fechaDeHoyEnLetras, CLAVE_DOCUMENTO, CLAVE_ACTUALIZADO,
} from "@/lib/legal";
import { DOCUMENTO_POR_DEFECTO } from "@/lib/legalPorDefecto";

/**
 * Los Términos y Condiciones, editables.
 *
 * El documento entero va en UN cuadro, con la barra de formato fija arriba
 * (`EditorDeDocumento`). La primera versión daba una caja por bloque —sesenta y
 * ocho para este contrato— y era peor de usar: no se podía leer del tirón ni
 * mover una frase de una cláusula a otra sin cortar y pegar entre cajas.
 *
 * Lo que se GUARDA sigue siendo una estructura de bloques, nunca HTML. Que se
 * edite en un `contenteditable` no cambia eso: `documentoDesdeDom` reconoce las
 * etiquetas que entiende y descarta el resto. El motivo está en
 * `documentoLegal.ts` y es de seguridad — esta página la abre cualquiera sin
 * sesión, incluido el revisor de Google Play.
 */
export default function AdminLegal({ isSuper }: { isSuper: boolean }) {
  const [bloques, setBloques] = useState<Documento>(DOCUMENTO_POR_DEFECTO);
  const [actualizado, setActualizado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);

  useEffect(() => {
    fetchDocumentoLegal().then((d) => {
      setBloques(d.bloques);
      setActualizado(d.actualizado);
      setCargando(false);
    });
  }, []);

  const alEditar = (d: Documento) => {
    setBloques(d);
    setSucio(true);
  };

  // ── Lo que hay que mirar antes de guardar ──────────────────────────────────
  const avisos = useMemo(() => {
    const lista: string[] = [];
    const conTexto = bloques.filter((b) => textoPlano(b).trim());

    if (conTexto.length === 0) lista.push("El documento está vacío.");
    if (!bloques.some((b) => b.ancla === "datos-personales" && b.tipo === "titulo")) {
      // Esto importa de verdad: /privacidad es la dirección que Google Play
      // tiene registrada como política de privacidad de la ficha.
      lista.push(
        "Ninguna cláusula está marcada como la de datos personales. Pon el cursor en el " +
        "título que corresponda y pulsa «Datos personales» en la barra; si no, /privacidad " +
        "abrirá el documento por el principio en vez de bajar hasta ella.",
      );
    }
    if (bloques.length >= MAX_BLOQUES) {
      lista.push(`El documento llegó al tope de ${MAX_BLOQUES} bloques; lo que pase de ahí se pierde.`);
    }
    return lista;
  }, [bloques]);

  const guardar = async () => {
    const limpio = bloques.filter((b) => textoPlano(b).trim());
    if (!limpio.length) {
      toast({
        title: "No se puede guardar un documento vacío",
        description: "La página legal es pública y Google Play la revisa.",
        variant: "destructive",
      });
      return;
    }
    setGuardando(true);
    try {
      // La fecha la pone el sistema, no el usuario: si hubiera que teclearla,
      // un día diría junio en un texto retocado en septiembre.
      const fecha = fechaDeHoyEnLetras();
      await Promise.all([
        setSetting(CLAVE_DOCUMENTO, limpio, "Términos y Condiciones · Documento"),
        setSetting(CLAVE_ACTUALIZADO, fecha, "Términos y Condiciones · Última actualización"),
      ]);
      setBloques(limpio);
      setActualizado(fecha);
      setSucio(false);
      toast({
        title: "Términos guardados",
        description: `Ya es lo que ve cualquiera en /terminos. Fecha del documento: ${fecha}.`,
      });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    }
    setGuardando(false);
  };

  const restaurar = () => {
    // Copia profunda: si no, editar después modificaría la constante del módulo
    // y el «texto de fábrica» dejaría de serlo en lo que queda de sesión.
    alEditar(DOCUMENTO_POR_DEFECTO.map((b) => ({ ...b, texto: b.texto.map((f) => ({ ...f })) })));
    toast({
      title: "Texto de fábrica cargado",
      description: "Todavía no se ha guardado: revísalo y pulsa Guardar si es lo que quieres.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base md:text-lg">Términos y Condiciones y Política de Privacidad</CardTitle>
        <p className="text-xs text-muted-foreground">
          Es el documento que se ve en <span className="font-mono">/terminos</span>,{" "}
          <span className="font-mono">/privacidad</span> y en la ventana que aparece al
          registrarse. Lo que guardes aquí se publica al momento.
        </p>
        {!isSuper && (
          <p className="text-xs text-muted-foreground">
            Solo lectura: únicamente un superadministrador puede cambiar este documento.
          </p>
        )}
        {actualizado && (
          <p className="text-xs text-muted-foreground">
            Última actualización del documento: <span className="font-semibold">{actualizado}</span>.
            La fecha se pone sola cada vez que guardas.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {avisos.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
            {avisos.map((a) => (
              <p key={a} className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertCircle size={13} className="mt-0.5 shrink-0" /> {a}
              </p>
            ))}
          </div>
        )}

        <Tabs defaultValue="editar">
          <TabsList>
            <TabsTrigger value="editar" className="gap-1.5"><Pencil size={13} /> Editar</TabsTrigger>
            <TabsTrigger value="vista" className="gap-1.5"><Eye size={13} /> Vista previa</TabsTrigger>
          </TabsList>

          <TabsContent value="editar" className="pt-4">
            {cargando ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Cargando el documento…</p>
            ) : (
              <EditorDeDocumento valor={bloques} onChange={alEditar} disabled={!isSuper} />
            )}
          </TabsContent>

          <TabsContent value="vista" className="pt-4">
            <div className="rounded-md border bg-background p-5 max-w-3xl">
              {/* Es el MISMO componente que pinta la página pública, no una
                  imitación: si se viera distinto aquí, la vista previa estaría
                  mintiendo justo sobre lo que sirve para comprobar. */}
              <DocumentoLegal documento={bloques.filter((b) => textoPlano(b).trim())} />
              <p className="mt-5 text-xs text-muted-foreground">
                Fecha de última actualización: {sucio ? fechaDeHoyEnLetras() : actualizado}
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          {sucio && (
            <p className="mr-auto text-xs text-amber-700">Hay cambios sin guardar.</p>
          )}
          <Button variant="outline" className="gap-1.5" disabled={!isSuper || guardando} onClick={restaurar}>
            <RotateCcw size={14} /> Volver al texto de fábrica
          </Button>
          <Button className="gap-2" disabled={!isSuper || guardando || cargando} onClick={guardar}>
            <Save size={14} /> {guardando ? "Guardando…" : "Guardar y publicar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
