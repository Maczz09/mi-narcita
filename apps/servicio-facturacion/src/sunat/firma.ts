import { SignedXml } from 'xml-crypto';
import { ClavesFirma } from './certificado';

/**
 * Firma XMLDSig conforme al perfil que exige SUNAT (verificado contra
 * Greenter, la referencia de facto en Perú — 2026-08). NO es exclusive-c14n
 * ni SHA-256: SUNAT sigue usando C14N estándar + SHA-1, a diferencia de otras
 * autoridades tributarias de la región.
 *
 * Precondición: `xmlSinFirmar` debe traer ya el slot vacío
 * `ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent` donde se inserta
 * el `<ds:Signature>` (lo pone `ubl.builder.ts`). Si tu plantilla llega a
 * tener más de un `UBLExtension`, precisa el xpath de `location.reference`
 * al primero: "(//*[local-name(.)='UBLExtension'])[1]/*[local-name(.)='ExtensionContent']".
 */
export function firmarComprobante(xmlSinFirmar: string, claves: ClavesFirma): string {
  const sig = new SignedXml({
    privateKey: claves.privateKeyPem,
    publicCert: claves.certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });

  sig.addReference({
    xpath: '/*',
    isEmptyUri: true, // → <ds:Reference URI=""> (documento completo, enveloped)
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature', // quita el propio <ds:Signature> del cálculo
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315', // canonicaliza el resto antes de hashear
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });

  sig.computeSignature(xmlSinFirmar, {
    prefix: 'ds',
    location: {
      reference: "//*[local-name(.)='ExtensionContent']",
      action: 'append',
    },
  });

  return sig.getSignedXml();
}
