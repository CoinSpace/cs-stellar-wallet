'use strict';

const Big = require('big.js');
const helpers = require('./helpers');
const StellarBase = require('stellar-base');

function preCreateTx(params) {
  const { to } = params;
  const { value } = params;
  const { memo } = params;
  const { wallet } = params;
  const { needToCreateAccount } = params;

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

  let error;

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
  const { wallet } = params;
  const { tx } = params;
  const { value } = params;

  const balance = Big(wallet.getBalance()).minus(wallet.minReserve);
  const fee = helpers.toLumen(tx.fee);
  const needed = Big(value).plus(fee);

  if (balance.lt(needed)) {
    const error = new Error('Insufficient funds');
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
  preCreateTx,
  postCreateTx,
  secret,
};
