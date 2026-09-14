// El documento legal de fábrica: Términos y Condiciones + Política de
// Tratamiento de Datos Personales de CORP LOZANOCHEFFER SAC.
//
// ── PARA QUÉ SIGUE EXISTIENDO SI AHORA SE EDITA DESDE EL PANEL ───────────────
//
// Es el respaldo. Si la base no responde, o si la migración todavía no se ha
// aplicado, lo que se enseña es esto. Una sección vacía en la portada se ve
// rota; una PÁGINA LEGAL vacía es otra cosa: es la dirección que Google Play
// tiene registrada como política de privacidad y que revisa en cada
// actualización de la ficha, y encontrarla en blanco es un rechazo.
//
// Es además el punto de partida que siembra la migración 0151, así que el mismo
// texto acaba en dos sitios. No está copiado a mano: `scripts/generar-semilla-
// legal.mjs` escribe el SQL a partir de ESTE fichero, y una prueba compara las
// dos copias para que no puedan separarse.
//
// ── POR QUÉ EN NOTACIÓN DE TEXTO Y NO EN OBJETOS ─────────────────────────────
//
// Son sesenta y tantos bloques. Escritos como objetos literales, revisar una
// coma de una cláusula obliga a leer JSON; así se lee el contrato. La notación
// la resuelve `parsearDocumento` una sola vez, al cargar el módulo.
import { parsearDocumento, type Documento } from "@/lib/documentoLegal";
import { CORREO_SOPORTE } from "@/lib/soporte";

/**
 * La fecha que lleva el documento de fábrica.
 *
 * A partir de la 0151 la fecha real se guarda aparte y se pone sola cada vez
 * que alguien guarda desde el panel: así no puede quedarse una fecha que dice
 * junio en un texto que se retocó en septiembre. Esta es solo la del texto que
 * viene de origen.
 */
export const FECHA_POR_DEFECTO = "16 de junio de 2026";

/**
 * El documento, en la notación de `parsearDocumento`:
 *
 *     ##  epígrafe      #  título de cláusula      -  viñeta      >  nota
 *     **negrita**       {datos-personales} marca la cláusula a la que baja /privacidad
 *
 * El correo sale de `CORREO_SOPORTE` y no está escrito a mano: aquí decía
 * `privacidad@coleffe.com`, un buzón que nadie confirmó que existiera, y su
 * gemelo `soporte@coleffe.com` resultó NO existir en cPanel. Una política que
 * remite a un correo que rebota para ejercer derechos sobre datos personales es
 * justo lo que mira un revisor. A partir de aquí lo mantiene el cliente desde
 * el panel, como el resto del texto.
 */
const FUENTE = `
## Publicación de Avisos Clasificados

El presente documento (en adelante, los "Términos y Condiciones") regula el acceso y uso del servicio de publicación de avisos clasificados, con y sin opción de visibilidad destacada (en adelante, el "Servicio"), ofrecido por CORP LOZANOCHEFFER SAC, identificada con RUC N° 20616009061, con domicilio fiscal en Ramal Sun S/N – Huaca del Sol - Moche, Trujillo, Perú (en adelante, "LA EMPRESA"). Al registrarse, contratar, acceder o utilizar el Servicio, el usuario (en adelante, "EL CLIENTE") declara haber leído, comprendido y aceptado de forma libre, expresa, informada e inequívoca el contenido íntegro de estos Términos y Condiciones, incluyendo la Política de Tratamiento de Datos Personales aquí contenida.

# 1. Objeto y alcance del servicio

LA EMPRESA pone a disposición de EL CLIENTE una plataforma digital para la publicación de avisos clasificados, los cuales podrán contratarse bajo dos modalidades:

- **Aviso sin visibilidad destacada:** publicación estándar del aviso dentro del listado general de la categoría correspondiente, sujeta a los tiempos y posiciones determinados por el algoritmo de ordenamiento de la plataforma.
- **Aviso con visibilidad destacada:** publicación que incluye beneficios adicionales de posicionamiento, tales como mayor exposición, ubicación preferente, renovación automática de vigencia u otros atributos descritos en el plan contratado, conforme a las tarifas vigentes publicadas por LA EMPRESA.

La aceptación de estos Términos y Condiciones es condición previa, necesaria e indispensable para acceder a cualquiera de las modalidades del Servicio.

# 2. Aceptación del contrato

- La ejecución de cualquier acción de contratación, registro, pago o publicación de un aviso constituye la manifestación expresa de la voluntad de EL CLIENTE de aceptar íntegramente estos Términos y Condiciones, con el mismo valor y efectos jurídicos que una firma manuscrita, conforme a lo establecido en el artículo 141 y 141-A del Código Civil peruano y en la Ley N° 27269, Ley de Firmas y Certificados Digitales.
- LA EMPRESA podrá modificar el contenido de estos Términos y Condiciones en cualquier momento, notificando los cambios a través de la plataforma o al correo electrónico registrado por EL CLIENTE. El uso continuado del Servicio luego de dicha notificación implica la aceptación de las modificaciones.
- Si EL CLIENTE no está de acuerdo con los presentes Términos y Condiciones, deberá abstenerse de utilizar el Servicio.

# 3. Marco normativo aplicable

El tratamiento de los datos personales de EL CLIENTE por parte de LA EMPRESA se rige por el siguiente marco normativo:

- **Normativa nacional (Perú):** Ley N° 29733, Ley de Protección de Datos Personales, y su Reglamento aprobado por Decreto Supremo N° 003-2013-JUS, así como las directivas emitidas por la Autoridad Nacional de Protección de Datos Personales (ANPD); Constitución Política del Perú, artículo 2, inciso 6; Código Civil; Código de Protección y Defensa del Consumidor (Ley N° 29571); y Ley N° 27269, Ley de Firmas y Certificados Digitales.
- **Estándares y principios internacionales:** se han considerado, de manera referencial y complementaria, principios reconocidos en el Reglamento General de Protección de Datos de la Unión Europea (RGPD - UE 2016/679), las Directrices de la OCDE sobre Privacidad, y los principios universales de protección de datos (legalidad, finalidad, proporcionalidad, calidad, seguridad, disposición de recurso, nivel de protección adecuado y consentimiento), en lo que resulte aplicable y no contravenga la normativa peruana.

# 4. Datos personales recopilados {datos-personales}

Para la prestación del Servicio, LA EMPRESA podrá recopilar y tratar las siguientes categorías de datos personales de EL CLIENTE:

- **Datos de identificación:** nombres y apellidos, tipo y número de documento de identidad (DNI, RUC, carné de extranjería o pasaporte), fecha de nacimiento.
- **Datos de contacto:** correo electrónico, número telefónico, dirección física, ciudad y país de residencia.
- **Datos de facturación y pago:** información requerida para la emisión de comprobantes de pago y el procesamiento de transacciones, gestionados a través de pasarelas de pago certificadas.
- **Datos de navegación y uso:** dirección IP, identificadores de dispositivo, cookies, historial de avisos publicados, preferencias de búsqueda y estadísticas de interacción con la plataforma.
- **Datos contenidos en los avisos:** la información que EL CLIENTE decida incluir voluntariamente en el contenido del aviso publicado, siendo de su exclusiva responsabilidad evitar la inclusión de datos sensibles o de terceros sin autorización.

# 5. Finalidad del tratamiento

Los datos personales de EL CLIENTE serán tratados para las siguientes finalidades:

- Gestionar el registro, la autenticación y la administración de la cuenta de EL CLIENTE.
- Procesar la contratación, publicación, renovación y visualización de los avisos clasificados, con o sin visibilidad destacada.
- Procesar pagos, emitir comprobantes electrónicos y cumplir con obligaciones tributarias y contables.
- Brindar atención al cliente, soporte técnico y atención de reclamos.
- Enviar comunicaciones operativas vinculadas al Servicio (confirmaciones, vencimientos, renovaciones).
- Previa autorización expresa, remitir comunicaciones comerciales, promocionales y publicitarias sobre productos o servicios de LA EMPRESA o de terceros aliados.
- Realizar análisis estadísticos, segmentación y mejora continua de la plataforma y de la experiencia de usuario.
- Cumplir con obligaciones legales, requerimientos de autoridades competentes y prevención de fraude.

# 6. Consentimiento del titular

- EL CLIENTE otorga su consentimiento previo, informado, expreso e inequívoco para el tratamiento de sus datos personales conforme a las finalidades descritas en la cláusula 5, al ejecutar el acceso, registro o contratación del Servicio mediante la aceptación electrónica de los presentes Términos y Condiciones.
- El consentimiento para finalidades distintas a la ejecución del contrato (por ejemplo, el envío de publicidad de terceros) podrá ser otorgado de manera separada y opcional, pudiendo EL CLIENTE marcar o desmarcar dicha opción en el formulario correspondiente, sin que ello afecte la prestación del Servicio principal.
- EL CLIENTE podrá revocar su consentimiento en cualquier momento, sin efectos retroactivos, conforme al procedimiento descrito en la cláusula 9 sobre derechos ARCO.

# 7. Banco de datos personales y encargo de tratamiento

- Los datos personales de EL CLIENTE serán incorporados a un banco de datos de uso propio, titularidad de CORP LOZANOCHEFFER SAC, el cual será inscrito ante el Registro Nacional de Protección de Datos Personales administrado por la Autoridad Nacional de Protección de Datos Personales (ANPD), conforme a lo exigido por la Ley N° 29733 y su Reglamento.
- LA EMPRESA podrá encargar el tratamiento de determinados datos a proveedores de servicios tecnológicos, de hosting, de mensajería, de procesamiento de pagos o de analítica web, quienes actuarán como encargados de tratamiento, sujetos a obligaciones contractuales de confidencialidad y seguridad, y únicamente para los fines encomendados por LA EMPRESA.

# 8. Transferencia y flujo transfronterizo de datos

En caso de que LA EMPRESA contrate proveedores de servicios cuyos servidores o infraestructura se encuentren ubicados fuera del territorio peruano (incluyendo servicios de almacenamiento en la nube, pasarelas de pago internacionales o herramientas de analítica), dicho flujo transfronterizo de datos personales se realizará garantizando un nivel de protección adecuado, conforme a lo dispuesto en el artículo 15 de la Ley N° 29733 y los artículos 71 a 83 de su Reglamento, ya sea mediante la verificación de que el país de destino cuente con un nivel de protección adecuado, la suscripción de cláusulas contractuales de protección de datos, o la obtención del consentimiento de EL CLIENTE cuando ello sea exigible.

# 9. Derechos del titular de datos personales (Derechos ARCO)

EL CLIENTE, en su calidad de titular de datos personales, podrá ejercer en cualquier momento y de forma gratuita los siguientes derechos, reconocidos por la Ley N° 29733 y su Reglamento:

- **Acceso:** conocer qué datos personales son objeto de tratamiento, su origen y las finalidades del mismo.
- **Rectificación:** solicitar la corrección de datos inexactos, incompletos o desactualizados.
- **Cancelación o supresión:** solicitar la eliminación de sus datos personales del banco de datos cuando ya no resulten necesarios para las finalidades para las cuales fueron recopilados, salvo que exista una obligación legal de conservarlos.
- **Oposición:** oponerse al tratamiento de sus datos personales para finalidades específicas, en particular respecto del envío de comunicaciones comerciales o publicitarias.
- **Portabilidad:** solicitar la entrega de sus datos personales en un formato estructurado, de uso común y lectura mecanizada, cuando ello sea técnicamente posible.

Para ejercer estos derechos, EL CLIENTE deberá enviar una solicitud al correo electrónico ${CORREO_SOPORTE}, adjuntando copia de su documento de identidad y la descripción clara de su solicitud. LA EMPRESA atenderá dicha solicitud dentro del plazo establecido por la normativa vigente (veinte días hábiles, prorrogables conforme a ley). En caso de disconformidad con la respuesta, EL CLIENTE podrá presentar un reclamo ante la Autoridad Nacional de Protección de Datos Personales (ANPD).

# 10. Plazo de conservación de los datos

Los datos personales de EL CLIENTE serán conservados durante el tiempo que dure la relación contractual derivada de la contratación del Servicio y, posteriormente, durante los plazos adicionales que resulten necesarios para el cumplimiento de obligaciones legales, tributarias, contables o de atención de reclamos, así como para la atención de los plazos de prescripción legalmente establecidos. Una vez cumplidas dichas finalidades, los datos serán eliminados, anonimizados o bloqueados, según corresponda.

# 11. Medidas de seguridad

LA EMPRESA implementa medidas de seguridad de índole técnica, organizativa y legal razonables y proporcionales al riesgo, destinadas a proteger los datos personales de EL CLIENTE contra su alteración, pérdida, tratamiento o acceso no autorizado, conforme a lo dispuesto en la Ley N° 29733, su Reglamento y la Directiva de Seguridad de la Información administrada por la ANPD. Dichas medidas incluyen, entre otras, el cifrado de información sensible, controles de acceso basados en roles, copias de seguridad periódicas y protocolos de respuesta ante incidentes de seguridad.

# 12. Cookies y tecnologías de seguimiento

La plataforma utiliza cookies y tecnologías similares con la finalidad de mejorar la experiencia de navegación, recordar preferencias, realizar análisis estadísticos y, de ser autorizado por EL CLIENTE, mostrar publicidad personalizada. EL CLIENTE puede configurar su navegador para rechazar o eliminar cookies, considerando que ello podría afectar el correcto funcionamiento de determinadas secciones de la plataforma.

# 13. Responsabilidad sobre el contenido de los avisos

EL CLIENTE es el único responsable del contenido, veracidad, legalidad y exactitud de la información incluida en los avisos clasificados publicados, así como de contar con la autorización correspondiente respecto de cualquier dato personal de terceros que decida incluir en dichos avisos. LA EMPRESA podrá, sin que ello genere obligación alguna, revisar, suspender o eliminar avisos que infrinjan la normativa vigente, derechos de terceros o las políticas de uso de la plataforma.

# 14. Vigencia, modificación y resolución

Estos Términos y Condiciones entrarán en vigencia desde el momento de su aceptación por parte de EL CLIENTE y se mantendrán vigentes durante todo el periodo de uso del Servicio. LA EMPRESA se reserva el derecho de modificar, suspender o discontinuar el Servicio, total o parcialmente, previa comunicación a través de los canales habituales de contacto, sin que ello genere derecho a indemnización a favor de EL CLIENTE, salvo lo dispuesto por norma imperativa.

# 15. Legislación aplicable y jurisdicción

Los presentes Términos y Condiciones se rigen por las leyes de la República del Perú. Cualquier controversia derivada de su interpretación, ejecución o cumplimiento será sometida a los jueces y tribunales del distrito judicial correspondiente al domicilio de LA EMPRESA, sin perjuicio de las normas de protección al consumidor que resulten aplicables y de las vías administrativas ante INDECOPI o la ANPD, según corresponda.

# 16. Canales de contacto

- **Razón social:** CORP LOZANOCHEFFER SAC
- **RUC:** 20616009061
- **Domicilio:** Ramal Sun S/N – Huaca del Sol – Campiña de Moche
- **Correo de contacto / privacidad:** ${CORREO_SOPORTE}
- **Teléfono:** +51 957 531 755

> Al hacer clic en "Aceptar", registrarse, contratar o publicar un aviso a través de la plataforma, EL CLIENTE declara haber leído y aceptado de manera libre, expresa e informada el presente documento de Términos y Condiciones y Política de Tratamiento de Datos Personales de CORP LOZANOCHEFFER SAC.
`;

/** El documento de fábrica, ya en bloques. */
export const DOCUMENTO_POR_DEFECTO: Documento = parsearDocumento(FUENTE);
