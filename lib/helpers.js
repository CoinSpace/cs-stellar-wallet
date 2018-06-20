'use strict';

var Buffer = require('safe-buffer').Buffer;
var Big = require('big.js');
var StellarBase = require('stellar-base');

function generateAccount(seed) {
  var entropy = new Buffer(seed, 'hex');
  var keypair = StellarBase.Keypair.fromRawEd25519Seed(entropy.slice(0, 32));
  return {
    keypair: keypair,
    secret: keypair.secret(),
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
