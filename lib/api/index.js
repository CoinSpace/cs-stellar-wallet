'use strict';

const Accounts = require('./accounts');
const Transactions = require('./transactions');
const Common = require('./common');

class API {
  constructor() {
    const baseURL = process.env.API_XLM_URL; // eslint-disable-line no-undef
    this.accounts = new Accounts(baseURL);
    this.transactions = new Transactions(baseURL);
    this.common = new Common(baseURL);
  }
}

module.exports = API;
