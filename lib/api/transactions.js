'use strict';

var postRequest = require('./utils').postRequest;
var getRequest = require('./utils').getRequest;

function Transactions(url) {
  this.url = url;
}

Transactions.prototype.get = function(txId) {
  return getRequest(this.url + 'tx/' + txId).then(function(data) {
    return Promise.resolve(data.tx);
  });
};

Transactions.prototype.propagate = function(rawtx) {
  return postRequest(this.url + 'tx/send', {rawtx: rawtx})
    .then(function(data) {
      return Promise.resolve(data.txId);
    });
};

module.exports = Transactions;
