'use strict';

const API = require('./api');
const validator = require('./validator');
const helpers = require('./helpers');
const Big = require('big.js');
const StellarBase = require('stellar-base');

class Wallet {
  constructor(options) {
    this.decimals = 7;
    this.factor = Big(10).pow(this.decimals);
    this._balance = '0';

    if (!options) {
      return this;
    }

    const { seed } = options;
    const { publicKey } = options;

    if (options.useTestNetwork) {
      this.networkPassphrase = StellarBase.Networks.TESTNET;
    } else {
      this.networkPassphrase = StellarBase.Networks.PUBLIC;
    }

    this.networkName = options.networkName;
    this.api = new API();
    this.fee = '0.00001';
    this._minReserve = '1';
    this.isActive = false;
    this.txsCursor = undefined;
    this.sequence = '0';
    this.dustThreshold = 0.0000001;
    this.isLocked = !seed;
    this.denomination = 'XLM';
    this.name = 'Stellar';

    if (seed) {
      this.account = helpers.generateAccount(seed);
    } else if (publicKey) {
      this.account = helpers.generateAccount(null, publicKey);
    } else {
      throw new Error('seed or publicKey should be passed');
    }
    this.addressString = this.account.address;
  }
  async load() {
    const results = await Promise.all([
      this.api.accounts.info(this.addressString),
      this.api.common.ledger(),
    ]);
    this._balance = results[0].balance;
    this.sequence = results[0].sequence;
    this.isActive = results[0].isActive;
    this.fee = results[1].baseFee;
    this._minReserve = Big(results[1].baseReserve).times(2).toFixed();
  }
  async update() {
    const result = await this.api.common.ledger();
    this.fee = result.baseFee;
    this._minReserve = Big(result.baseReserve).times(2).toFixed();
  }
  async loadTxs() {
    const data = await this.api.accounts.txs(this.addressString, this.txsCursor);
    data.txs = this.transformTxs(this.addressString, data.txs);
    this.txsCursor = data.cursor;
    return data;
  }
  lock() {
    this.account.keypair = null;
    this.isLocked = true;
  }
  unlock(seed) {
    this.account = helpers.generateAccount(seed);
    this.isLocked = false;
  }
  publicKey() {
    return this.account.address;
  }
  getDestinationInfo(address) {
    return this.api.accounts.info(address);
  }
  get balance() {
    return this._unitToAtom(this._balance);
  }
  get minReserve() {
    return this._unitToAtom(this._minReserve);
  }
  getNextAddress() {
    return this.addressString;
  }
  createTx(to, value, memo, needToCreateAccount) {
    value = this._atomToUnit(value);
    validator.preCreateTx({
      wallet: this,
      to,
      value,
      memo,
      needToCreateAccount,
    });

    const sourceAccount = new StellarBase.Account(this.account.address, this.sequence);
    const builderOptions = {
      fee: helpers.toStroop(this.fee),
      networkPassphrase: this.networkPassphrase,
    };
    const builder = new StellarBase.TransactionBuilder(sourceAccount, builderOptions);
    builder.setTimeout(300);
    if (needToCreateAccount) {
      builder.addOperation(StellarBase.Operation.createAccount({
        destination: to,
        startingBalance: value,
      }));
    } else {
      builder.addOperation(StellarBase.Operation.payment({
        destination: to,
        asset: StellarBase.Asset.native(),
        amount: value,
      }));
    }

    if (memo) {
      builder.addMemo(StellarBase.Memo.text(memo));
    }
    const tx = builder.build();

    validator.postCreateTx({
      wallet: this,
      tx,
      value,
    });

    const that = this;
    return {
      sign() {
        tx.sign(that.account.keypair);
        return tx;
      },
    };
  }
  get defaultFee() {
    return this._unitToAtom(this.fee);
  }
  get maxAmount() {
    const balance = Big(this._balance).minus(this._minReserve).minus(this.fee);
    return this._unitToAtom(helpers.max(balance, 0));
  }
  async sendTx(tx) {
    const amount = this.getTxAmount(tx);
    const fee = helpers.toLumen(tx.fee);
    const rawtx = tx.toEnvelope().toXDR().toString('base64');
    await this.api.transactions.propagate(rawtx);
    if (tx.source === this.addressString) {
      this.sequence = Big(this.sequence).add(1).toFixed();
      this._balance = Big(this._balance).minus(amount).minus(fee).toFixed();
    } else {
      this._balance = Big(this._balance).plus(amount).toFixed();
    }
  }
  createPrivateKey(secret) {
    validator.secret(secret);
    return helpers.getKeypairFromSecret(secret);
  }
  createImportTx(options) {
    const amount = Big(this._atomToUnit(options.amount)).minus(this.fee);
    if (amount.lt(0)) {
      throw new Error('Insufficient funds');
    }
    if (!this.isActive && amount.lt(this._minReserve)) {
      throw new Error('Less than minimum reserve');
    }

    const sourceAccount = new StellarBase.Account(options.address, options.sequence);
    const builderOptions = {
      fee: helpers.toStroop(this.fee),
      networkPassphrase: this.networkPassphrase,
    };
    const builder = new StellarBase.TransactionBuilder(sourceAccount, builderOptions);
    builder.setTimeout(300);

    if (options.needToCreateAccount) {
      builder.addOperation(StellarBase.Operation.createAccount({
        destination: options.to,
        startingBalance: amount.toFixed(),
      }));
    } else {
      builder.addOperation(StellarBase.Operation.payment({
        destination: options.to,
        asset: StellarBase.Asset.native(),
        amount: amount.toFixed(),
      }));
    }

    const tx = builder.build();
    return {
      sign() {
        tx.sign(options.keypair);
        return tx;
      },
    };
  }
  async getImportTxOptions(keypair) {
    const address = keypair.publicKey();
    if (address === this.account.address) {
      return Promise.reject(new Error('Private key equal wallet private key'));
    }

    const info = await this.api.accounts.info(address);
    return {
      amount: this._unitToAtom(helpers.max(Big(info.balance).minus(this._minReserve), Big(0)).toFixed()),
      sequence: info.sequence,
      needToCreateAccount: !this.isActive,
      keypair,
      address,
    };
  }
  exportPrivateKeys() {
    let str = 'address,privatekey\n';
    str += this.addressString + ',' + this.account.keypair.secret();
    return str;
  }
  _atomToUnit(value) {
    return Big(value).div(this.factor).toFixed(this.decimals);
  }
  _unitToAtom(value) {
    return Big(value).times(this.factor).toFixed(0);
  }
  transformTx(address, tx) {
    tx.fee = this._unitToAtom(tx.fee);
    tx.amount = tx.operations.reduce((sum, item) => {
      if (item.destination === tx.from) {
        return sum;
      } else {
        return sum.plus(item.amount);
      }
    }, Big(0)).toFixed();

    tx.operations.forEach((item) => {
      item.amount = this._unitToAtom(item.amount);
    });

    if (tx.from === address) {
      tx.amount = '-' + tx.amount;
    }
    tx.isIncoming = tx.amount > 0;
    tx.amount = this._unitToAtom(tx.amount);
    return tx;
  }
  transformTxs(address, txs) {
    if (Array.isArray(txs)) {
      return txs.map((tx) => {
        return this.transformTx(address, tx);
      });
    } else {
      return this.transformTx(address, txs);
    }
  }
  getTxAmount(tx) {
    const amount = tx.operations.reduce((sum, item) => {
      if (item.type === 'payment') {
        return sum.plus(item.amount);
      } else if (item.type === 'createAccount') {
        return sum.plus(item.startingBalance);
      }
      return sum;
    }, Big(0));
    return amount;
  }
  serialize() {
    return JSON.stringify({
      networkName: this.networkName,
      balance: this._balance,
      fee: this.fee,
      secret: this.account.keypair.secret(),
      sequence: this.sequence,
      minReserve: this._minReserve,
      dustThreshold: this.dustThreshold,
    });
  }
  static deserialize(json) {
    const wallet = new Wallet();
    const deserialized = JSON.parse(json);

    wallet.networkName = deserialized.networkName;
    wallet.api = new API();
    wallet._balance = deserialized.balance;
    wallet.fee = deserialized.fee;

    const keypair = helpers.getKeypairFromSecret(deserialized.secret);
    wallet.account = {
      keypair,
      secret: keypair.secret(),
      address: keypair.publicKey(),
    };

    wallet.addressString = wallet.account.address;
    wallet.sequence = deserialized.sequence;
    wallet._minReserve = deserialized.minReserve;
    wallet.dustThreshold = deserialized.dustThreshold;

    return wallet;
  }
}

module.exports = Wallet;
