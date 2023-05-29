import Accounts from './Accounts.js';
import Common from './Common.js';
import Transactions from './Transactions.js';

export default class API {
  constructor(wallet) {
    this.accounts = new Accounts(wallet);
    this.transactions = new Transactions(wallet);
    this.common = new Common(wallet);
  }
}
