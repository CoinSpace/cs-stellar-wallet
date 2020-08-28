'use strict';

var Big = require('big.js');
var StellarBase = require('stellar-base');

function generateAccount(seed, publicKey) {
  if (!seed) {
    return {
      secret: null,
      address: publicKey
    };
  }

  var entropy = Buffer.from(seed, 'hex');
  var keypair = StellarBase.Keypair.fromRawEd25519Seed(entropy.slice(0, 32));
  return {
    keypair: keypair,
    address: keypair.publicKey()
  };
}

function getKeypairFromSecret(secret) {
  return StellarBase.Keypair.fromSecret(secret);
}

function max(a, b) {
  return Big(a).gt(b) ? a : b;
}

function toStroop(lumen) {
  return Big(lumen).times(1e7).toFixed();
}

function toLumen(stroop) {
  return Big(stroop).div(1e7).toFixed();
}

module.exports = {
  generateAccount: generateAccount,
  getKeypairFromSecret: getKeypairFromSecret,
  max: max,
  toStroop: toStroop,
  toLumen: toLumen
};
