'use strict';

var Big = require('big.js');
var helpers = require('./helpers');
var StellarBase = require('stellar-base');
var Buffer = require('safe-buffer').Buffer;

function preCreateTx(params) {
  var to = params.to;
  var value = params.value;
  var memo = params.memo;
  var wallet = params.wallet;
  var needToCreateAccount = params.needToCreateAccount;

  if (!wallet.isActive) {
    throw new Error('Inactive account');
  }

  if (memo && Buffer.byteLength(memo, 'utf8') > 28) {
    throw new Error('Invalid memo');
  }

  if (!StellarBase.StrKey.isValidEd25519PublicKey(to)) {
    throw new Error('Invalid address');
  }

  if (Big(helpers.toStroop(value)).gt(Big('9223372036854775807'))) { // Stellar MAX_INT64
    throw new Error('Insufficient funds');
  }

  var error;

  if (value <= wallet.dustThreshold) {
    error = new Error('Invalid value');
    error.dustThreshold = wallet.dustThreshold;
    throw error;
  }

  if (needToCreateAccount && Big(value).lt(wallet.minReserve)) {
    error = new Error('Invalid value');
    error.details = 'Less than minimum reserve';
    throw error;
  }
}

function postCreateTx(params) {
  var wallet = params.wallet;
  var tx = params.tx;
  var value = params.value;

  var balance = Big(wallet.getBalance()).minus(wallet.minReserve);
  var fee = helpers.toLumen(tx.fee);
  var needed = Big(value).plus(fee);

  if (balance.lt(needed)) {
    var error = new Error('Insufficient funds');
    error.details = 'Attempt to empty wallet';
    error.sendableBalance = helpers.max(balance.minus(fee), 0);
    throw error;
  }
}

function secret(secret) {
  if (StellarBase.StrKey.isValidEd25519SecretSeed(secret)) return true;
  throw new Error('Invalid private key');
}

module.exports = {
  preCreateTx: preCreateTx,
  postCreateTx: postCreateTx,
  secret: secret
};
