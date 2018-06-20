'use strict';

var Accounts = require('./accounts');
var Transactions = require('./transactions');
var Common = require('./common');

function API() {
  var baseURL = process.env.API_XLM_URL; // eslint-disable-line no-undef
  this.accounts = new Accounts(baseURL);
  this.transactions = new Transactions(baseURL);
  this.common = new Common(baseURL);
}

module.exports = API;
