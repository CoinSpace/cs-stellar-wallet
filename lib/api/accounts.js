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

Accounts.prototype.txs = function(address, cursor, limit) {
  var self = this;
  return validateAddress(address).then(function() {
    return getRequest(self.url + 'account/' + address + '/txs', {cursor: cursor, limit: limit})
      .then(function(data) {
        return {
          txs: data.txs,
          hasMoreTxs: data.txs.length === limit
        };
      });
  });
};

module.exports = Accounts;
