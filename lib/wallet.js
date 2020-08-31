'use strict';

var API = require('./api');
var validator = require('./validator');
var helpers = require('./helpers');
var Big = require('big.js');
var StellarBase = require('stellar-base');

function Wallet(options) {
  if (arguments.length === 0) return this;

  var seed = options.seed;
  var publicKey = options.publicKey;

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

  if (seed) {
    this.account = helpers.generateAccount(seed);
  } else if (publicKey) {
    this.account = helpers.generateAccount(null, publicKey);
  } else {
    throw new Error('seed or publicKey should be passed');
  }
  this.addressString = this.account.address;
}

Wallet.prototype.load = function(options) {
  var that = this;
  var done = options.done;

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
  }).catch(done);
};

Wallet.prototype.loadTxs = function() {
  var that = this;
  return this.api.accounts.txs(that.addressString, that.txsCursor).then(function(data) {
    data.txs = transformTxs(that.addressString, data.txs);
    that.txsCursor = data.cursor;
    return data;
  });
};


Wallet.prototype.lock = function() {
  this.account.keypair = null;
  this.isLocked = true;
};

Wallet.prototype.unlock = function(privateKey) {
  this.account.keypair = helpers.getKeypairFromSecret(privateKey);
  this.isLocked = false;
};

Wallet.prototype.dumpKeys = function() {
  if (this.isLocked) throw new Error('wallet is locked');
  return {
    public: this.account.address,
    private: this.account.keypair.secret()
  };
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
    tx.isIncoming = tx.amount > 0;
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

  var sourceAccount = new StellarBase.Account(this.account.address, this.sequence);
  var builderOptions = {
    fee: helpers.toStroop(this.fee),
    networkPassphrase: this.networkPassphrase
  };
  var builder = new StellarBase.TransactionBuilder(sourceAccount, builderOptions);
  builder.setTimeout(300);
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

  var that = this;
  return {
    sign: function() {
      tx.sign(that.account.keypair);
      return tx;
    }
  };
};

Wallet.prototype.getDefaultFee = function() {
  return this.fee;
};

Wallet.prototype.getMaxAmount = function() {
  var balance = Big(this.balance).minus(this.minReserve).minus(this.fee);
  return helpers.max(balance, 0);
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

  var sourceAccount = new StellarBase.Account(options.address, options.sequence);
  var builderOptions = {
    fee: helpers.toStroop(this.fee),
    networkPassphrase: this.networkPassphrase
  };
  var builder = new StellarBase.TransactionBuilder(sourceAccount, builderOptions);
  builder.setTimeout(300);

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
  return {
    sign: function() {
      tx.sign(options.keypair);
      return tx;
    }
  };
};

Wallet.prototype.getImportTxOptions = function(keypair) {
  var address = keypair.publicKey();
  if (address === this.account.address) {
    return Promise.reject(new Error('Private key equal wallet private key'));
  }

  var that = this;

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
  str += this.addressString + ',' + this.account.keypair.secret();
  return str;
};

Wallet.prototype.serialize = function() {
  return JSON.stringify({
    networkName: this.networkName,
    balance: this.getBalance(),
    fee: this.getDefaultFee(),
    secret: this.account.keypair.secret(),
    sequence: this.sequence,
    minReserve: this.minReserve,
    dustThreshold: this.dustThreshold
  });
};

Wallet.deserialize = function(json) {
  var wallet = new Wallet();
  var deserialized = JSON.parse(json);

  wallet.networkName = deserialized.networkName;
  wallet.api = new API();
  wallet.balance = deserialized.balance;
  wallet.fee = deserialized.fee;

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

  return wallet;
};

module.exports = Wallet;
