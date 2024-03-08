import { errors } from '@coinspace/cs-common';
import { Keypair, StrKey } from '@stellar/stellar-base';

export function getKeypairFromSeed(seed) {
  return Keypair.fromRawEd25519Seed(seed.slice(0, 32));
}

export function getAddressFromSeed(seed) {
  return getKeypairFromSeed(seed).publicKey();
}

export function getKeypairFromSecret(secret) {
  if (StrKey.isValidEd25519SecretSeed(secret)) {
    return Keypair.fromSecret(secret);
  }
  throw new errors.InvalidPrivateKeyError();
}

export function getAddressFromSecret(secret) {
  return getKeypairFromSecret(secret).publicKey();
}

export function utf8ToBytes(str) {
  if (typeof str !== 'string') {
    throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
  }
  return new TextEncoder().encode(str);
}
