// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * ESTAR AUTENTICADO Y QUE LA APP NO SE ENTERE.
 *
 * ── EL FALLO ─────────────────────────────────────────────────────────────────
 *
 * Hay DOS almacenes de sesión: el de Supabase (que se refresca solo) y el
 * nuestro, `effe_session`, que escribe `syncSession` y lee toda la interfaz.
 *
 * `syncSession` lee el perfil y los roles. Si esa lectura falla —red, arranque
 * en frío— lanza `RoleSyncError` y no escribe el nuestro. El resultado es un
 * usuario **autenticado en Supabase** al que la aplicación trata de visitante:
 * la barra lo enseña desconectado y cada acción con guarda lo manda al login.
 *
 * Se reportó como «el botón Guardar saca de la sesión» (2026-09-05). Se
 * comprobó en la base que la sesión de ese usuario estaba viva y rotando cada 58
 * minutos: no se le habia caducado nada, era este desajuste.
 *
 * `asegurarSesion` es la respuesta: antes de dar a alguien por desconectado, se
 * le pregunta a Supabase, que es quien lo sabe.
 */

const getSupabaseSession = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSupabaseSession(...a),
      signOut: vi.fn(),
    },
    from: (...a: unknown[]) => from(...a),
  },
  supabaseUrl: "https://x.supabase.co",
  supabaseConfigError: null,
}));

import { asegurarSesion } from "@/lib/auth";
import { setSessionData, getSession } from "@/hooks/useSession";

const USUARIO = { id: "u1", email: "ana@correo.com", user_metadata: { full_name: "Ana García" } };

/** Respuestas de `profiles` y `user_roles`, en ese orden. */
const respuestas = (perfil: unknown, roles: unknown) => {
  from.mockImplementation((tabla: string) => {
    const encadenable = {
      select: () => encadenable,
      eq: () => encadenable,
      maybeSingle: () => Promise.resolve(perfil),
      then: (r: (v: unknown) => void) => Promise.resolve(roles).then(r),
    };
    return tabla === "profiles" ? encadenable : encadenable;
  });
};

beforeEach(() => {
  localStorage.clear();
  getSupabaseSession.mockReset();
  from.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("asegurarSesion", () => {
  it("si ya hay sesión local, la devuelve sin molestar a Supabase", async () => {
    setSessionData({ role: "buscador", name: "Ana", initials: "AN", supabase: true });

    const s = await asegurarSesion();

    expect(s?.name).toBe("Ana");
    expect(getSupabaseSession).not.toHaveBeenCalled();
  });

  it("🔴 sin sesión local pero CON sesión en Supabase, la reconstruye", async () => {
    // Este es el caso del reporte: autenticado de verdad, espejo local vacío.
    getSupabaseSession.mockResolvedValue({ data: { session: { user: USUARIO } } });
    respuestas({ data: { full_name: "Ana García", initials: "AG", status: "active" } },
               { data: [{ role: "buscador" }], error: null });

    const s = await asegurarSesion();

    expect(s).not.toBeNull();
    expect(s?.name).toBe("Ana García");
    expect(s?.supabase).toBe(true);
    // Y queda escrito, para que el resto de la app deje de verlo desconectado.
    expect(getSession()?.name).toBe("Ana García");
  });

  it("sin sesión en Supabase, es un visitante de verdad", async () => {
    getSupabaseSession.mockResolvedValue({ data: { session: null } });

    expect(await asegurarSesion()).toBeNull();
  });

  it("si tampoco ahora se pueden leer los roles, falla CERRADA", async () => {
    // Preferible pedirle que inicie sesión que dejarle actuar con un rol que no
    // hemos podido confirmar. Es el mismo criterio que ya tenía `syncSession`.
    getSupabaseSession.mockResolvedValue({ data: { session: { user: USUARIO } } });
    respuestas({ data: { full_name: "Ana", status: "active" } },
               { data: null, error: { message: "sin red" } });

    expect(await asegurarSesion()).toBeNull();
  });
});
