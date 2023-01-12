import { errors } from 'cs-common';
import { Keypair, StrKey } from 'stellar-base';

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
  throw new errors.InvalidSecretError();
}

export function getAddressFromSecret(secret) {
  return getKeypairFromSecret(secret).publicKey();
}
