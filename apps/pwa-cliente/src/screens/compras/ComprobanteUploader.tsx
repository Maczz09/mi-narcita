/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/ComprobanteUploader.tsx — Sube la foto de la boleta/factura.
// Precomprime en el cliente (WebP) para que la subida se sienta instantánea;
// el servidor SIEMPRE vuelve a comprimir (autoridad real de formato/tamaño/EXIF).

import { useRef, useState } from 'react';
import { Icons } from '../../components/ui/icons';
import { precomprimirComprobante } from '../../utils/imagenComprobante';

interface ComprobanteUploaderProps {
  disabled?: boolean;
  compacto?: boolean;
  onSubir: (archivo: Blob, nombreArchivo: string) => Promise<unknown>;
}

export function ComprobanteUploader({ disabled, compacto, onSubir }: Readonly<ComprobanteUploaderProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendo(true);
    try {
      const comprimido = await precomprimirComprobante(archivo);
      await onSubir(comprimido, archivo.name.replace(/\.[^.]+$/, '.webp'));
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onChange}
      />
      <button
        type="button"
        className="btn btn-sm btn-soft"
        disabled={disabled || subiendo}
        onClick={() => inputRef.current?.click()}
      >
        <Icons.Receipt s={compacto ? 12 : 14} /> {subiendo ? 'Subiendo…' : 'Subir boleta'}
      </button>
    </>
  );
}
