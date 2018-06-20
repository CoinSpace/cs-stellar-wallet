'use strict';

var assert = require('assert');
var API = require('./api');
var validator = require('./validator');
var helpers = require('./helpers');
var Big = require('big.js');
var StellarBase = require('stellar-base');

function Wallet(options) {
  if (arguments.length === 0) return this;

  var seed = options.seed;
  var done = options.done;
  var txDone = options.txDone ? options.txDone : function() {};

  if (options.useTestNetwork) {
    StellarBase.Network.useTestNetwork();
  } else {
    StellarBase.Network.usePublicNetwork();
  }

  try {
    assert(seed, 'seed cannot be empty');
  } catch (err) {
    return doneError(err);
  }

  this.networkName = options.networkName;
  this.txsPerPage = options.txsPerPage || 20;
  this.api = new API();
  this.balance = '0';
  this.fee = '0.00001';
  this.minReserve = '1';
  this.isActive = false;
  this.historyTxs = [];
  this.hasMoreTxs = false;
  this.sequence = '0';
  this.account = helpers.generateAccount(seed);
  this.addressString = this.account.address;

  this.dustThreshold = 0.0000001;

  var that = this;

  Promise.all([
    that.api.accounts.info(that.addressString),
    that.api.common.ledger()
  ]).then(function(results) {
    that.balance = results[0].balance;
    that.sequence = results[0].sequence;
    that.isActive = results[0].isActive;
    that.fee = results[1].baseFee;
    that.minReserve = Big(results[1].baseReserve).times(2).toFixed();
    done(null, that);
  }).catch(done).then(function() {
    if (!that.isActive) return txDone(null, that);
    return that.loadTxs(that.addressString).then(function(data) {
      that.historyTxs = data.txs;
      that.hasMoreTxs = data.hasMoreTxs;
      txDone(null, that);
    });
  }).catch(txDone);

  function doneError(err) {
    done(err);
    txDone(err);
  }
}

Wallet.prototype.loadTxs = function(address, cursor) {
  return this.api.accounts.txs(address, cursor, this.txsPerPage).then(function(data) {
    data.txs = transformTxs(address, data.txs);
    return data;
  });
};

function transformTxs(address, txs) {
  if (Array.isArray(txs)) {
    return txs.map(function(tx) {
      return transformTx(address, tx);
    });
  } else {
    return transformTx(address, txs);
  }
  function transformTx(address, tx) {
    tx.amount = tx.operations.reduce(function(sum, item) {
      if (item.destination === tx.from) {
        return sum;
      } else {
        return sum.plus(item.amount);
      }
    }, Big(0)).toFixed();

    if (tx.from === address) {
      tx.amount = '-' + tx.amount;
    }
    return tx;
  }
}

Wallet.prototype.getDestinationInfo = function(address) {
  return this.api.accounts.info(address);
};

Wallet.prototype.getBalance = function() {
  return this.balance;
};

Wallet.prototype.getNextAddress = function() {
  return this.addressString;
};

Wallet.prototype.createTx = function(to, value, memo, needToCreateAccount) {
  validator.preCreateTx({
    wallet: this,
    to: to,
    value: value,
    memo: memo,
    needToCreateAccount: needToCreateAccount
  });

  var that = this;
  var sourceAccount = new StellarBase.Account(that.account.address, that.sequence);
  var builder = new StellarBase.TransactionBuilder(sourceAccount, {fee: helpers.toStroop(that.fee)});
  if (needToCreateAccount) {
    builder.addOperation(StellarBase.Operation.createAccount({
      destination: to,
      startingBalance: value
    }));
  } else {
    builder.addOperation(StellarBase.Operation.payment({
      destination: to,
      asset: StellarBase.Asset.native(),
      amount: value
    }));
  }

  if (memo) {
    builder.addMemo(StellarBase.Memo.text(memo));
  }
  var tx = builder.build();

  validator.postCreateTx({
    wallet: this,
    tx: tx,
    value: value
  });

  tx.sign(this.account.keypair);
  return tx;
};

Wallet.prototype.getDefaultFee = function() {
  return this.fee;
};

Wallet.prototype.sendTx = function(tx, done) {
  var that = this;
  var amount = getTxAmount(tx);
  var fee = helpers.toLumen(tx.fee);
  var rawtx = tx.toEnvelope().toXDR().toString('base64');
  return that.api.transactions.propagate(rawtx).then(function() {
    if (tx.source === that.addressString) {
      that.sequence = Big(that.sequence).add(1).toFixed();
      that.balance = Big(that.balance).minus(amount).minus(fee).toFixed();
    } else {
      that.balance = Big(that.balance).plus(amount).minus(fee).toFixed();
    }
    done(null);
  }).catch(done);
};

function getTxAmount(tx) {
  var amount = tx.operations.reduce(function(sum, item) {
    if (item.type === 'payment') {
      return sum.plus(item.amount);
    } else if (item.type === 'createAccount') {
      return sum.plus(item.startingBalance);
    }
    return sum;
  }, Big(0));
  return amount;
}

Wallet.prototype.getTransactionHistory = function() {
  return this.historyTxs;
};

Wallet.prototype.createPrivateKey = function(secret) {
  validator.secret(secret);
  return helpers.getKeypairFromSecret(secret);
};

Wallet.prototype.createImportTx = function(options) {
  var amount = Big(options.amount).minus(this.fee);
  if (amount.lt(0)) {
    throw new Error('Insufficient funds');
  }
  if (!this.isActive && amount.lt(this.minReserve)) {
    throw new Error('Less than minimum reserve');
  }

  var that = this;
  var sourceAccount = new StellarBase.Account(options.address, options.sequence);
  var builder = new StellarBase.TransactionBuilder(sourceAccount, {fee: helpers.toStroop(that.fee)});

  if (options.needToCreateAccount) {
    builder.addOperation(StellarBase.Operation.createAccount({
      destination: options.to,
      startingBalance: amount.toFixed()
    }));
  } else {
    builder.addOperation(StellarBase.Operation.payment({
      destination: options.to,
      asset: StellarBase.Asset.native(),
      amount: amount.toFixed()
    }));
  }

  var tx = builder.build();
  tx.sign(options.keypair);
  return tx;
};

Wallet.prototype.getImportTxOptions = function(keypair) {
  if (keypair.secret() === this.account.secret) {
    return Promise.reject(new Error('Private key equal wallet private key'));
  }
  var that = this;
  var address = keypair.publicKey();

  return that.api.accounts.info(address).then(function(info) {
    return {
      amount: helpers.max(Big(info.balance).minus(that.minReserve), Big(0)).toFixed(),
      sequence: info.sequence,
      needToCreateAccount: !that.isActive,
      keypair: keypair,
      address: address
    };
  });
};

Wallet.prototype.exportPrivateKeys = function() {
  var str = 'address,privatekey\n';
  str += this.addressString + ',' + this.account.secret;
  return str;
};

Wallet.prototype.serialize = function() {
  return JSON.stringify({
    networkName: this.networkName,
    balance: this.getBalance(),
    fee: this.getDefaultFee(),
    historyTxs: this.historyTxs,
    secret: this.account.secret,
    sequence: this.sequence,
    minReserve: this.minReserve,
    dustThreshold: this.dustThreshold,
    txsPerPage: this.txsPerPage
  });
};

Wallet.deserialize = function(json) {
  var wallet = new Wallet();
  var deserialized = JSON.parse(json);

  wallet.networkName = deserialized.networkName;
  wallet.api = new API();
  wallet.balance = deserialized.balance;
  wallet.fee = deserialized.fee;
  wallet.historyTxs = deserialized.historyTxs;

  var keypair = helpers.getKeypairFromSecret(deserialized.secret);
  wallet.account = {
    keypair: keypair,
    secret: keypair.secret(),
    address: keypair.publicKey()
  };

  wallet.addressString = wallet.account.address;
  wallet.sequence = deserialized.sequence;
  wallet.minReserve = deserialized.minReserve;
  wallet.dustThreshold = deserialized.dustThreshold;
  wallet.txsPerPage = deserialized.txsPerPage;

  return wallet;
};

module.exports = Wallet;
