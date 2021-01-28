'use strict';

const { getRequest } = require('./utils');
const StellarBase = require('stellar-base');

class Accounts {
  constructor(url) {
    this.url = url;
  }
  info(address) {
    const self = this;
    return validateAddress(address).then(() => {
      return getRequest(self.url + 'account/' + address).then((data) => {
        return {
          sequence: data.sequence,
          balance: data.balance,
          isActive: data.isActive,
        };
      });
    });
  }
  txs(address, cursor) {
    const self = this;
    return validateAddress(address).then(() => {
      return getRequest(self.url + 'account/' + address + '/txs', { cursor })
        .then((data) => {
          const hasMoreTxs = data.txs.length === data.limit;
          return {
            txs: data.txs,
            hasMoreTxs,
            cursor: hasMoreTxs && data.txs[data.txs.length - 1].cursor,
          };
        });
    });
  }
}

function validateAddress(address) {
  return new Promise((resolve, reject) => {
    if (StellarBase.StrKey.isValidEd25519PublicKey(address)) {
      resolve();
    } else {
      reject(new Error(address + ' is not a valid address'));
    }
  });
}

module.exports = Accounts;
