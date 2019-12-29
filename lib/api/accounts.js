'use strict';

var getRequest = require('./utils').getRequest;
var StellarBase = require('stellar-base');

function Accounts(url) {
  this.url = url;
}

function validateAddress(address) {
  return new Promise(function(resolve, reject) {
    if (StellarBase.StrKey.isValidEd25519PublicKey(address)) {
      resolve();
    } else {
      reject(new Error(address + ' is not a valid address'));
    }
  });
}

Accounts.prototype.info = function(address) {
  var self = this;
  return validateAddress(address).then(function() {
    return getRequest(self.url + 'account/' + address).then(function(data) {
      return {
        sequence: data.sequence,
        balance: data.balance,
        isActive: data.isActive
      };
    });
  });
};

Accounts.prototype.txs = function(address, cursor) {
  var self = this;
  return validateAddress(address).then(function() {
    return getRequest(self.url + 'account/' + address + '/txs', {cursor: cursor})
      .then(function(data) {
        var hasMoreTxs = data.txs.length === data.limit;
        return {
          txs: data.txs,
          hasMoreTxs: hasMoreTxs,
          cursor: hasMoreTxs && data.txs[data.txs.length - 1].cursor
        };
      });
  });
};

module.exports = Accounts;
