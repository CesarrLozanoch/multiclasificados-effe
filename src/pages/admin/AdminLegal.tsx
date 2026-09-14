import { useEffect, useMemo, useState } from "react";
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown, Copy, RotateCcw, AlertCircle, Eye, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EditorDeTexto } from "@/components/EditorDeTexto";
import { DocumentoLegal } from "@/components/DocumentoLegal";
import { toast } from "@/hooks/use-toast";
import { setSetting } from "@/lib/admin";
import { mensajeDeError } from "@/lib/errores";
import {
  TIPOS_DE_BLOQUE, textoPlano, MAX_TEXTO, MAX_BLOQUES,
  type Bloque, type Documento, type TipoBloque,
} from "@/lib/documentoLegal";
import {
  fetchDocumentoLegal, fechaDeHoyEnLetras, CLAVE_DOCUMENTO, CLAVE_ACTUALIZADO,
} from "@/lib/legal";
import { DOCUMENTO_POR_DEFECTO } from "@/lib/legalPorDefecto";

/**
 * Los Términos y Condiciones, editables.
 *
 * ── POR QUÉ NO ES UN CUADRO DE TEXTO GRANDE ──────────────────────────────────
 *
 * Porque el documento se guarda como una estructura de bloques, no como texto
 * ni como HTML —ver `documentoLegal.ts` para el motivo, que es de seguridad—, y
 * lo que se edita tiene que ser lo que se guarda. Un cuadro único obligaría a
 * inventar una sintaxis, enseñársela al cliente y volver a parsearla en cada
 * tecla: tres sitios donde perder una cláusula.
 *
 * Por bloques, además, se reordena una cláusula sin cortar y pegar dos mil
 * caracteres, y la numeración es texto normal que se retoca a mano (a propósito:
 * numerar solo obligaría a renumerar todas las referencias cruzadas del
 * contrato —«conforme a la cláusula 9»— cada vez que alguien inserta una).
 *
 * ── SE VE MIENTRAS SE ESCRIBE ────────────────────────────────────────────────
 *
 * Cada bloque usa el mismo editor que la descripción de un aviso, así que la
 * negrita se ve puesta, no marcada. Y al lado hay una vista previa del
 * documento entero, tal cual lo verá quien entre en `/terminos`.
 */

const VACIO: Bloque = { tipo: "parrafo", texto: [{ t: "" }] };

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

  // ── Manipular la lista ─────────────────────────────────────────────────────
  const tocar = (fn: (d: Documento) => Documento) => {
    setBloques((d) => fn(d));
    setSucio(true);
  };

  const cambiarTexto = (i: number, texto: Bloque["texto"]) =>
    tocar((d) => d.map((b, j) => (j === i ? { ...b, texto } : b)));

  const cambiarTipo = (i: number, tipo: TipoBloque) =>
    tocar((d) => d.map((b, j) => {
      if (j !== i) return b;
      // El ancla solo tiene sentido en un título: si deja de serlo, se va con
      // él. Si no, quedaría un ancla escondida en un párrafo y `/privacidad`
      // aterrizaría en mitad de un texto sin encabezado.
      const { ancla: _fuera, ...resto } = b;
      return tipo === "titulo" && b.ancla ? { ...resto, tipo, ancla: b.ancla } : { ...resto, tipo };
    }));

  const mover = (i: number, delta: number) =>
    tocar((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.length) return d;
      const copia = [...d];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  const insertar = (i: number) =>
    tocar((d) => (d.length >= MAX_BLOQUES ? d : [...d.slice(0, i + 1), VACIO, ...d.slice(i + 1)]));

  const duplicar = (i: number) =>
    tocar((d) => {
      if (d.length >= MAX_BLOQUES) return d;
      // La copia NUNCA se lleva el ancla: dos elementos con el mismo id es HTML
      // inválido y el salto de `/privacidad` se vuelve impredecible.
      const { ancla: _fuera, ...copia } = d[i];
      return [...d.slice(0, i + 1), { ...copia, texto: [...d[i].texto] }, ...d.slice(i + 1)];
    });

  const borrar = (i: number) => tocar((d) => d.filter((_, j) => j !== i));

  const marcarAncla = (i: number) =>
    tocar((d) => d.map((b, j) => {
      if (j === i) return { ...b, ancla: "datos-personales" as const };
      const { ancla: _fuera, ...resto } = b;
      return resto;   // exclusiva: marcar una desmarca la anterior
    }));

  const quitarAncla = (i: number) =>
    tocar((d) => d.map((b, j) => {
      if (j !== i) return b;
      const { ancla: _fuera, ...resto } = b;
      return resto;
    }));

  // ── Lo que hay que mirar antes de guardar ──────────────────────────────────
  const avisos = useMemo(() => {
    const lista: string[] = [];
    const conTexto = bloques.filter((b) => textoPlano(b).trim());

    if (conTexto.length === 0) lista.push("El documento está vacío.");
    if (conTexto.length < bloques.length) {
      lista.push(
        `Hay ${bloques.length - conTexto.length} bloque(s) sin texto; no se guardarán.`,
      );
    }
    if (!bloques.some((b) => b.ancla === "datos-personales" && b.tipo === "titulo")) {
      // Esto importa de verdad: es la dirección que Google Play tiene guardada
      // como política de privacidad de la ficha.
      lista.push(
        "Ninguna cláusula está marcada como la de datos personales: /privacidad dejará " +
        "de bajar hasta ella y abrirá el documento por el principio.",
      );
    }
    const largos = bloques.filter((b) => textoPlano(b).length > MAX_TEXTO).length;
    if (largos) lista.push(`${largos} bloque(s) pasan de ${MAX_TEXTO} caracteres y se recortarán.`);
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
    tocar(() => DOCUMENTO_POR_DEFECTO.map((b) => ({ ...b, texto: [...b.texto] })));
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

          {/* ── EDITAR ── */}
          <TabsContent value="editar" className="pt-4 space-y-3">
            {cargando ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Cargando el documento…</p>
            ) : (
              <>
                {bloques.map((b, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={b.tipo}
                        disabled={!isSuper}
                        onValueChange={(v) => cambiarTipo(i, v as TipoBloque)}
                      >
                        <SelectTrigger className="h-8 w-[190px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_DE_BLOQUE.map((t) => (
                            <SelectItem key={t.tipo} value={t.tipo} className="text-xs">
                              {t.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <span className="text-[11px] text-muted-foreground">
                        {i + 1} de {bloques.length}
                      </span>

                      <div className="ml-auto flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          disabled={!isSuper || i === 0}
                          onClick={() => mover(i, -1)} aria-label="Subir este bloque">
                          <ChevronUp size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          disabled={!isSuper || i === bloques.length - 1}
                          onClick={() => mover(i, 1)} aria-label="Bajar este bloque">
                          <ChevronDown size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          disabled={!isSuper} onClick={() => duplicar(i)} aria-label="Duplicar este bloque">
                          <Copy size={13} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          disabled={!isSuper} onClick={() => insertar(i)} aria-label="Añadir un bloque debajo">
                          <Plus size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                          disabled={!isSuper} onClick={() => borrar(i)} aria-label="Borrar este bloque">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>

                    <EditorDeTexto
                      valor={b.texto}
                      onChange={(v) => cambiarTexto(i, v)}
                      maxLength={MAX_TEXTO}
                      placeholder={b.tipo === "titulo" ? "1. Objeto y alcance del servicio" : "Escribe aquí…"}
                      className={b.tipo === "titulo" ? "font-bold" : ""}
                    />

                    {b.tipo === "titulo" && (
                      <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer">
                        <Checkbox
                          checked={b.ancla === "datos-personales"}
                          disabled={!isSuper}
                          onCheckedChange={(v) => (v ? marcarAncla(i) : quitarAncla(i))}
                        />
                        <span>
                          Esta es la cláusula de datos personales.{" "}
                          <span className="font-mono">/privacidad</span> baja directamente
                          hasta aquí, y es la dirección que Google Play tiene registrada como
                          política de privacidad. Solo puede estar marcada una.
                        </span>
                      </label>
                    )}
                  </div>
                ))}

                <Button
                  variant="outline" className="w-full gap-1.5"
                  disabled={!isSuper || bloques.length >= MAX_BLOQUES}
                  onClick={() => insertar(bloques.length - 1)}
                >
                  <Plus size={14} /> Añadir un bloque al final
                </Button>
              </>
            )}
          </TabsContent>

          {/* ── VISTA PREVIA ── */}
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
