// Manual ASN.1 TSQ (Timestamp Query) generator without external libraries

export function buildTSQ_ASN1(messageHashHex: string): Uint8Array {
  // Convert hex to bytes
  const digest = new Uint8Array(messageHashHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  // SHA-256 OID: 2.16.840.1.101.3.4.2.1
  const sha256Oid = [0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01];
  
  // Construct the ASN.1 tree manually for SHA-256
  const hashedMessage = [0x04, 0x20, ...digest]; // OCTET STRING
  const algorithmId = [0x30, 0x0b, ...sha256Oid, 0x05, 0x00]; // SEQUENCE (OID + NULL)
  const messageImprint = [0x30, algorithmId.length + hashedMessage.length, ...algorithmId, ...hashedMessage];
  const version = [0x02, 0x01, 0x01]; // INTEGER 1
  
  // Request nonce (8 bytes)
  const nonceBytes = crypto.getRandomValues(new Uint8Array(8));
  const nonce = [0x02, 0x08, ...nonceBytes];
  
  // certReq = true
  const certReq = [0x01, 0x01, 0xFF];
  
  const reqContent = [...version, ...messageImprint, ...nonce, ...certReq];
  const tsq = new Uint8Array([0x30, reqContent.length, ...reqContent]);
  
  return tsq;
}
