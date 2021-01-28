'use strict';

const { postRequest } = require('./utils');
const { getRequest } = require('./utils');

class Transactions {
  constructor(url) {
    this.url = url;
  }
  get(txId) {
    return getRequest(this.url + 'tx/' + txId).then((data) => {
      return Promise.resolve(data.tx);
    });
  }
  propagate(rawtx) {
    return postRequest(this.url + 'tx/send', { rawtx })
      .then((data) => {
        return Promise.resolve(data.txId);
      });
  }
}

module.exports = Transactions;
