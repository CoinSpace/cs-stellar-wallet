'use strict';

const API = require('./api');
const validator = require('./validator');
const helpers = require('./helpers');
const Big = require('big.js');
const StellarBase = require('stellar-base');

class Wallet {
  constructor(options) {
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
    this.balance = '0';
    this.fee = '0.00001';
    this.minReserve = '1';
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
  load(options) {
    const that = this;
    const { done } = options;

    Promise.all([
      that.api.accounts.info(that.addressString),
      that.api.common.ledger(),
    ]).then((results) => {
      that.balance = results[0].balance;
      that.sequence = results[0].sequence;
      that.isActive = results[0].isActive;
      that.fee = results[1].baseFee;
      that.minReserve = Big(results[1].baseReserve).times(2).toFixed();
      done(null, that);
    }).catch(done);
  }
  loadTxs() {
    const that = this;
    return this.api.accounts.txs(that.addressString, that.txsCursor).then((data) => {
      data.txs = transformTxs(that.addressString, data.txs);
      that.txsCursor = data.cursor;
      return data;
    });
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
  getBalance() {
    return this.balance;
  }
  getNextAddress() {
    return this.addressString;
  }
  createTx(to, value, memo, needToCreateAccount) {
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
  getDefaultFee() {
    return this.fee;
  }
  getMaxAmount() {
    const balance = Big(this.balance).minus(this.minReserve).minus(this.fee);
    return helpers.max(balance, 0);
  }
  sendTx(tx, done) {
    const that = this;
    const amount = getTxAmount(tx);
    const fee = helpers.toLumen(tx.fee);
    const rawtx = tx.toEnvelope().toXDR().toString('base64');
    return that.api.transactions.propagate(rawtx).then(() => {
      if (tx.source === that.addressString) {
        that.sequence = Big(that.sequence).add(1).toFixed();
        that.balance = Big(that.balance).minus(amount).minus(fee).toFixed();
      } else {
        that.balance = Big(that.balance).plus(amount).minus(fee).toFixed();
      }
      done(null);
    }).catch(done);
  }
  createPrivateKey(secret) {
    validator.secret(secret);
    return helpers.getKeypairFromSecret(secret);
  }
  createImportTx(options) {
    const amount = Big(options.amount).minus(this.fee);
    if (amount.lt(0)) {
      throw new Error('Insufficient funds');
    }
    if (!this.isActive && amount.lt(this.minReserve)) {
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
  getImportTxOptions(keypair) {
    const address = keypair.publicKey();
    if (address === this.account.address) {
      return Promise.reject(new Error('Private key equal wallet private key'));
    }

    const that = this;

    return that.api.accounts.info(address).then((info) => {
      return {
        amount: helpers.max(Big(info.balance).minus(that.minReserve), Big(0)).toFixed(),
        sequence: info.sequence,
        needToCreateAccount: !that.isActive,
        keypair,
        address,
      };
    });
  }
  exportPrivateKeys() {
    let str = 'address,privatekey\n';
    str += this.addressString + ',' + this.account.keypair.secret();
    return str;
  }
  serialize() {
    return JSON.stringify({
      networkName: this.networkName,
      balance: this.getBalance(),
      fee: this.getDefaultFee(),
      secret: this.account.keypair.secret(),
      sequence: this.sequence,
      minReserve: this.minReserve,
      dustThreshold: this.dustThreshold,
    });
  }
  static deserialize(json) {
    const wallet = new Wallet();
    const deserialized = JSON.parse(json);

    wallet.networkName = deserialized.networkName;
    wallet.api = new API();
    wallet.balance = deserialized.balance;
    wallet.fee = deserialized.fee;

    const keypair = helpers.getKeypairFromSecret(deserialized.secret);
    wallet.account = {
      keypair,
      secret: keypair.secret(),
      address: keypair.publicKey(),
    };

    wallet.addressString = wallet.account.address;
    wallet.sequence = deserialized.sequence;
    wallet.minReserve = deserialized.minReserve;
    wallet.dustThreshold = deserialized.dustThreshold;

    return wallet;
  }
}

function transformTxs(address, txs) {
  if (Array.isArray(txs)) {
    return txs.map((tx) => {
      return transformTx(address, tx);
    });
  } else {
    return transformTx(address, txs);
  }
  function transformTx(address, tx) {
    tx.amount = tx.operations.reduce((sum, item) => {
      if (item.destination === tx.from) {
        return sum;
      } else {
        return sum.plus(item.amount);
      }
    }, Big(0)).toFixed();

    if (tx.from === address) {
      tx.amount = '-' + tx.amount;
    }
    tx.isIncoming = tx.amount > 0;
    return tx;
  }
}

function getTxAmount(tx) {
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

module.exports = Wallet;
