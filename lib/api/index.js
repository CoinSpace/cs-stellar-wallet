import Accounts from './accounts.js';
import Common from './common.js';
import Transactions from './transactions.js';

export default class API {
  constructor(wallet) {
    this.accounts = new Accounts(wallet);
    this.transactions = new Transactions(wallet);
    this.common = new Common(wallet);
  }
}
