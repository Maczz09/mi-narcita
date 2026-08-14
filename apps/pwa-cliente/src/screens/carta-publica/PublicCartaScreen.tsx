// screens/carta-publica/PublicCartaScreen.tsx — Carta pública/QR (T-XX):
// pantalla SIN autenticación, fuera del Shell/ProtectedRoute (ver
// router/index.tsx, mismo nivel que /imprimir/*). Cualquiera con el link o
// que escanee el QR de Inicio la ve. Fetch propio (no el queryClient
// persistido a localStorage del resto de la app — evita cachear 24h en una
// tablet compartida) con refetch periódico para que la disponibilidad se
// vea "al día" sin depender de un socket sin autenticar.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { obtenerSedePublica, obtenerCartaPublica } from '../../api/cartaPublica.api';
import { agruparPorTamano } from './agruparPorTamano';
import { fmt } from '../../utils/format';
import type { SedePublicaDto } from '../../types/cartaPublica.types';
import type { CategoriaDto, ProductoDto } from '../../types/inventario.types';
import './carta-publica.css';

const REFETCH_MS = 45_000;
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&display=swap';

function useFuentePublica() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

interface Datos {
  sede: SedePublicaDto | null;
  categorias: CategoriaDto[];
  productos: ProductoDto[];
}

export function PublicCartaScreen() {
  const { sedeId } = useParams<{ sedeId: string }>();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoriaActivaId, setCategoriaActivaId] = useState<string | null>(null);

  useFuentePublica();

  useEffect(() => {
    if (!sedeId) return;
    let cancelado = false;

    async function cargar() {
      try {
        const [sede, carta] = await Promise.all([obtenerSedePublica(sedeId!), obtenerCartaPublica(sedeId!)]);
        if (cancelado) return;
        setDatos({ sede, categorias: carta.categorias, productos: carta.productos });
        setError(null);
      } catch {
        if (!cancelado) setError('No se pudo cargar la carta. Verifica tu conexión e intenta de nuevo.');
      }
    }

    void cargar();
    const interval = setInterval(() => void cargar(), REFETCH_MS);
    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, [sedeId]);

  const categoriasConItems = useMemo(() => {
    if (!datos) return [];
    const idsConProductos = new Set(datos.productos.map((p) => p.categoriaId));
    return datos.categorias.filter((c) => idsConProductos.has(c.id));
  }, [datos]);

  useEffect(() => {
    if (categoriaActivaId || categoriasConItems.length === 0) return;
    setCategoriaActivaId(categoriasConItems[0].id);
  }, [categoriasConItems, categoriaActivaId]);

  const platosDeCategoriaActiva = useMemo(() => {
    if (!datos || !categoriaActivaId) return [];
    const productosDeCategoria = datos.productos.filter((p) => p.categoriaId === categoriaActivaId);
    return agruparPorTamano(productosDeCategoria);
  }, [datos, categoriaActivaId]);

  const categoriaActiva = categoriasConItems.find((c) => c.id === categoriaActivaId);

  if (!sedeId) {
    return (
      <div className="carta-publica">
        <div className="cp-estado">Link inválido.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="carta-publica">
        <div className="cp-estado">{error}</div>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="carta-publica">
        <div className="cp-estado">Cargando carta…</div>
      </div>
    );
  }

  if (!datos.sede) {
    return (
      <div className="carta-publica">
        <div className="cp-estado">Esta carta ya no está disponible.</div>
      </div>
    );
  }

  return (
    <div className="carta-publica">
      <header className="cp-header">
        <p className="cp-marca">Mi Narcita</p>
        <h1 className="cp-nombre-sede">{datos.sede.nombre}</h1>
        <div className="cp-datos-sede">
          {datos.sede.direccion && <span>{datos.sede.direccion}</span>}
          {datos.sede.telefono && <span>{datos.sede.telefono}</span>}
        </div>
      </header>

      {categoriasConItems.length === 0 ? (
        <div className="cp-vacio">Todavía no hay platos disponibles en esta carta.</div>
      ) : (
        <>
          <nav className="cp-tabs" aria-label="Categorías">
            {categoriasConItems.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`cp-tab ${cat.id === categoriaActivaId ? 'activo' : ''}`}
                onClick={() => setCategoriaActivaId(cat.id)}
              >
                {cat.nombre}
              </button>
            ))}
          </nav>

          <main className="cp-main">
            {categoriaActiva && (
              <>
                <h2 className="cp-categoria-titulo">{categoriaActiva.nombre}</h2>
                {categoriaActiva.descripcion && (
                  <p className="cp-categoria-desc">{categoriaActiva.descripcion}</p>
                )}
              </>
            )}
            <div className="cp-panel" key={categoriaActivaId}>
              {platosDeCategoriaActiva.map((plato) => (
                <div className="cp-plato" key={plato.key}>
                  <div className="cp-plato-cabecera">
                    <span className="cp-plato-nombre">{plato.nombre}</span>
                    {plato.precioUnico != null && (
                      <span className="cp-plato-precio-unico">{fmt(plato.precioUnico)}</span>
                    )}
                  </div>
                  {plato.descripcion && <p className="cp-plato-desc">{plato.descripcion}</p>}
                  {plato.precios && (
                    <div className="cp-tabla-tallas">
                      {plato.precios.personal != null && (
                        <div className="cp-talla">
                          <div className="cp-talla-label">Personal</div>
                          <div className="cp-talla-precio">{fmt(plato.precios.personal)}</div>
                        </div>
                      )}
                      {plato.precios.mediana != null && (
                        <div className="cp-talla">
                          <div className="cp-talla-label">Mediana</div>
                          <div className="cp-talla-precio">{fmt(plato.precios.mediana)}</div>
                        </div>
                      )}
                      {plato.precios.familiar != null && (
                        <div className="cp-talla">
                          <div className="cp-talla-label">Familiar</div>
                          <div className="cp-talla-precio">{fmt(plato.precios.familiar)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </main>
        </>
      )}

      <footer className="cp-footer">Precios incluyen IGV</footer>
    </div>
  );
}
