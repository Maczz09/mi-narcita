// components/layout/Shell.tsx — App chrome: sidebar + topbar + contenido
// v2: offline-banner usa aria-live="polite" + role="status" en lugar de
//     role="alert" (interruptivo). El anuncio llega cuando el lector de
//     pantalla termine la frase actual en lugar de interrumpir al usuario.
//     Añadida clase .has-form al .content cuando la pantalla de Mesas
//     tiene el formulario lateral visible (Bug 4 workaround sin :has()).

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useLastSynced } from '../../hooks/useLastSynced';
import { elapsedLabel } from '../../utils/format';

interface ShellProps {
  children: ReactNode;
  /** Pasar true desde MesasScreen cuando el panel lateral está visible
   *  (formulario "Nueva mesa") para añadir padding-bottom extra y evitar
   *  que el BottomNav tape el último campo del formulario. */
  hasSidePanel?: boolean;
}

export function Shell({ children, hasSidePanel = false }: Readonly<ShellProps>) {
  const online = useOnlineStatus();
  const lastSynced = useLastSynced();

  return (
    <div className="app">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      {/* Banner offline — aria-live="polite" para no interrumpir lectores de pantalla
          a media acción. role="status" es equivalente semántico de polite. */}
      {!online && (
        <div
          className="offline-banner"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <OfflineIcon />
          Sin conexión. Las acciones que modifican datos están pausadas.
          {lastSynced > 0 && ` Mostrando datos de hace ${elapsedLabel(new Date(lastSynced).toISOString())}.`}
        </div>
      )}

      <Sidebar />

      <div className="main">
        <Header />
        <main
          id="contenido"
          className={`content${hasSidePanel ? ' has-form' : ''}`}
          tabIndex={-1}
        >
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

function OfflineIcon() {
  return (
    <svg
      className="ic"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M1 1 23 23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
    </svg>
  );
}
