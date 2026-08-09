import * as forge from 'node-forge';

export interface ClavesFirma {
  privateKeyPem: string;
  certPem: string;
}

/**
 * Extrae clave privada + certificado de un .pfx (PKCS#12) de SUNAT/RENIEC.
 * xml-crypto trabaja con PEM, no con PKCS#12; node-forge evita depender del
 * binario `openssl` (y de pasar la contraseña por línea de comandos).
 */
export function extraerClavesDesdePfx(pfxBuffer: Buffer, password: string): ClavesFirma {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
    [forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })
    [forge.pki.oids.certBag]?.[0];

  if (!keyBag?.key || !certBag?.cert) {
    throw new Error('El .pfx no contiene una clave privada o un certificado válidos');
  }

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
  };
}
