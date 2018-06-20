'use strict';

var getRequest = require('./utils').getRequest;

function Common(url) {
  this.url = url;
}

Common.prototype.ledger = function() {
  var self = this;
  return getRequest(self.url + 'ledger');
};

module.exports = Common;
