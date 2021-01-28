'use strict';

const { getRequest } = require('./utils');

class Common {
  constructor(url) {
    this.url = url;
  }
  ledger() {
    const self = this;
    return getRequest(self.url + 'ledger');
  }
}

module.exports = Common;
