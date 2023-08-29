import * as errors from './errors.js';
import API from './api/API.js';
import {
  Account,
  Asset,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from 'stellar-base';
import {
  Amount,
  CsWallet,
  Transaction,
  utils,
} from '@coinspace/cs-common';
import {
  getAddressFromSecret,
  getAddressFromSeed,
  getKeypairFromSecret,
  getKeypairFromSeed,
  utf8ToBytes,
} from './helpers.js';

class StellarTransaction extends Transaction {
  get url() {
    if (this.development) {
      return `https://stellar.expert/explorer/testnet/tx/${this.id}`;
    }
    return `https://stellar.expert/explorer/public/tx/${this.id}`;
  }
}

// Stellar MAX_INT64
const MAX_INT64 = 9223372036854775807n;

export default class StellarWallet extends CsWallet {
  #api;
  #networkPassphrase;
  #dustThreshold = 1n;
  #address;
  #sequence = 0n;
  #balance = 0n;
  #isActive = false;
  #transactions = new Map();

  // memorized functions
  #getLedger;
  #getAccountInfo;

  get isMetaSupported() {
    return true;
  }

  get isImportSupported() {
    return true;
  }

  get metaNames() {
    return ['memo'];
  }

  get dummyExchangeDepositAddress() {
    return 'GDYSRGTDKQ4WVAASBDZR3IVQUGJMY5HPE5X3ENRLBN5JF6M3RDLS547J';
  }

  constructor(options = {}) {
    super(options);
    this.#api = new API(this);
    if (this.development) {
      this.#networkPassphrase = Networks.TESTNET;
    } else {
      this.#networkPassphrase = Networks.PUBLIC;
    }
    this.#getLedger = this.memoize(this._getLedger);
    this.#getAccountInfo = this.memoize(this._getAccountInfo);
  }

  get address() {
    return this.#address;
  }

  get balance() {
    return new Amount(this.#balance, this.crypto.decimals);
  }

  async create(seed) {
    this.state = CsWallet.STATE_INITIALIZING;
    this.typeSeed(seed);
    this.#address = getAddressFromSeed(seed);
    this.#init();
    this.state = CsWallet.STATE_INITIALIZED;
  }

  async open(publicKey) {
    this.typePublicKey(publicKey);
    this.state = CsWallet.STATE_INITIALIZING;
    this.#address = publicKey.data;
    this.#init();
    this.state = CsWallet.STATE_INITIALIZED;
  }

  #init() {
    this.#balance = BigInt(this.storage.get('balance') || 0);
  }

  async load() {
    this.state = CsWallet.STATE_LOADING;
    try {
      const info = await this.#getAccountInfo(this.#address);
      this.#balance = this.#unitToAtom(info.balance);
      this.#sequence = info.sequence;
      this.#isActive = info.isActive;
      this.storage.set('balance', this.#balance.toString());
      await this.storage.save();
      this.state = CsWallet.STATE_LOADED;
    } catch (err) {
      this.state = CsWallet.STATE_ERROR;
      throw err;
    }
  }

  async cleanup() {
    await super.cleanup();
    this.memoizeClear(this.#getLedger);
    this.memoizeClear(this.#getAccountInfo);
  }

  async loadTransactions({ cursor } = {}) {
    if (!cursor) {
      this.#transactions.clear();
    }
    const data = await this.#api.accounts.txs(this.#address, cursor);
    const transactions = this.#transformTxs(data.transactions);
    for (const transaction of transactions) {
      this.#transactions.set(transaction.id, transaction);
    }
    return {
      transactions,
      hasMore: data.hasMore,
      cursor: data.cursor,
    };
  }

  async loadTransaction(id) {
    if (this.#transactions.has(id)) {
      return this.#transactions.get(id);
    } else {
      try {
        return this.#transformTx(await this.#api.transactions.get(id));
      } catch (err) {
        return;
      }
    }
  }

  #transformTxs(txs) {
    return txs.map((tx) => {
      return this.#transformTx(tx);
    });
  }

  #transformTx(tx) {
    const incoming = tx.from !== this.#address;
    let to;
    const amount = tx.operations.reduce((sum, item) => {
      if (incoming && item.destination === this.#address) {
        to = item.destination;
        return sum + this.#unitToAtom(item.amount);
      }
      if (!incoming && item.destination !== this.#address) {
        // used last destination in tx
        to = item.destination;
        return sum + this.#unitToAtom(item.amount);
      }
      return sum;
    }, 0n);
    return new StellarTransaction({
      type: StellarTransaction.TYPE_TRANSFER,
      status: StellarTransaction.STATUS_SUCCESS,
      id: tx.id,
      to,
      from: tx.from,
      amount: new Amount(amount, this.crypto.decimals),
      incoming,
      fee: new Amount(this.#unitToAtom(tx.fee), this.crypto.decimals),
      // TODO check timestamp
      timestamp: new Date(tx.timestamp),
      meta: {
        memo: tx.memo,
      },
      development: this.development,
    });
  }

  getPublicKey() {
    return {
      data: this.#address,
    };
  }

  getPrivateKey(seed) {
    this.typeSeed(seed);
    const keypair = getKeypairFromSeed(seed);
    return [{
      address: keypair.publicKey(),
      secret: keypair.secret(),
    }];
  }

  // TODO separate to fee and reserved methods
  async _getLedger() {
    const data = await this.#api.common.ledger();
    return {
      fee: this.#unitToAtom(data.baseFee),
      // TODO why multiply by 2?
      minReserve: this.#unitToAtom(data.baseReserve) * 2n,
    };
  }

  async _getAccountInfo(address) {
    return this.#api.accounts.info(address);
  }

  async validateAddress({ address }) {
    super.validateAddress({ address });
    if (!StrKey.isValidEd25519PublicKey(address)) {
      throw new errors.InvalidAddressError(address);
    }
    if (address === this.#address) {
      throw new errors.DestinationEqualsSourceError();
    }
    return true;
  }

  async validateMeta({ address, meta = {} }) {
    super.validateMeta({ address });
    if (meta.memo !== undefined && utf8ToBytes(meta.memo).length > 28) {
      throw new errors.InvalidMemoError(meta.memo);
    }
    return true;
  }

  async validateAmount({ address, meta = {}, amount }) {
    super.validateAmount({ address, meta, amount });
    if (!this.#isActive) {
      throw new errors.InactiveAccountError();
    }
    const { value } = amount;
    if (value < this.#dustThreshold) {
      throw new errors.SmallAmountError(new Amount(this.#dustThreshold, this.crypto.decimals));
    }
    const maxAmount = await this.#estimateMaxAmount();
    if (value > maxAmount) {
      throw new errors.BigAmountError(new Amount(maxAmount, this.crypto.decimals));
    }
    if (value > MAX_INT64) {
      throw new errors.BigAmountError(new Amount(MAX_INT64, this.crypto.decimals));
    }
    const destinationInfo = await this.#getAccountInfo(address);
    const ledger = await this.#getLedger();
    if (!destinationInfo.isActive && value < ledger.minReserve) {
      throw new errors.MinimumReserveDestinationError(new Amount(ledger.minReserve, this.crypto.decimals));
    }
    return true;
  }

  async #estimateMaxAmount() {
    const ledger = await this.#getLedger();
    if (this.#balance < ledger.minReserve) {
      return 0n;
    }
    const maxAmount = this.#balance - ledger.fee - ledger.minReserve;
    if (maxAmount < 0n) {
      return 0n;
    }
    return maxAmount;
  }

  async estimateMaxAmount({ address, meta = {} }) {
    super.estimateMaxAmount({ address, meta });
    const maxAmount = await this.#estimateMaxAmount();
    return new Amount(maxAmount, this.crypto.decimals);
  }

  async estimateTransactionFee({ address, meta = {}, amount }) {
    super.estimateTransactionFee({ address, meta, amount });
    const ledger = await this.#getLedger();
    return new Amount(ledger.fee, this.crypto.decimals);
  }

  async createTransaction({ address, meta = {}, amount }, seed) {
    super.createTransaction({ address, amount }, seed);
    const { value } = amount;
    const ledger = await this.#getLedger();
    const account = new Account(this.#address, this.#sequence.toString());
    const builder = new TransactionBuilder(account, {
      fee: ledger.fee.toString(10),
      networkPassphrase: this.#networkPassphrase,
    });
    builder.setTimeout(300);
    const destinationInfo = await this.#getAccountInfo(address);
    if (!destinationInfo.isActive) {
      builder.addOperation(Operation.createAccount({
        destination: address,
        startingBalance: this.#atomToUnit(value),
      }));
    } else {
      builder.addOperation(Operation.payment({
        destination: address,
        asset: Asset.native(),
        amount: this.#atomToUnit(value),
      }));
    }
    if (meta.memo !== undefined) {
      builder.addMemo(Memo.text(meta.memo));
    }
    const transaction = builder.build();
    transaction.sign(getKeypairFromSeed(seed));
    const rawtx = transaction.toEnvelope().toXDR('base64');
    const id = await this.#api.transactions.propagate(rawtx);
    this.#sequence++;
    this.#balance = this.#balance - value - ledger.fee;
    this.storage.set('balance', this.#balance.toString());
    await this.storage.save();
    return id;
  }

  async #prepareImport(secret) {
    const address = getAddressFromSecret(secret);
    if (address === this.#address) {
      throw new errors.InvalidPrivateKeyError('Private key equal wallet private key');
    }
    const info = await this.#getAccountInfo(address);
    const balance = this.#unitToAtom(info.balance);
    const ledger = await this.#getLedger();
    const amount = balance - ledger.minReserve;
    const sendable = amount - ledger.fee;
    return {
      address,
      amount,
      fee: ledger.fee,
      sendable,
      sequence: info.sequence,
    };
  }

  async estimateImport({ privateKey }) {
    super.estimateImport();
    const { sendable } = await this.#prepareImport(privateKey);
    const ledger = await this.#getLedger();
    if (this.#isActive === false && sendable < ledger.minReserve) {
      // TODO should it be an error or just return 0 amount?
      throw new errors.MinimumReserveDestinationError(new Amount(ledger.minReserve, this.crypto.decimals));
    }
    if (sendable < this.#dustThreshold) {
      // TODO should it be an error or just return 0 amount?
      throw new errors.SmallAmountError(this.#dustThreshold, this.crypto.decimals);
    }
    return new Amount(sendable, this.crypto.decimals);
  }

  async createImport({ privateKey }) {
    super.createImport();
    const { address, sendable, sequence } = await this.#prepareImport(privateKey);
    const ledger = await this.#getLedger();

    const account = new Account(address, sequence.toString());
    const builder = new TransactionBuilder(account, {
      fee: ledger.fee.toString(10),
      networkPassphrase: this.#networkPassphrase,
    });
    builder.setTimeout(300);
    if (!this.#isActive) {
      builder.addOperation(Operation.createAccount({
        destination: this.#address,
        startingBalance: this.#atomToUnit(sendable),
      }));
    } else {
      builder.addOperation(Operation.payment({
        destination: this.#address,
        asset: Asset.native(),
        amount: this.#atomToUnit(sendable),
      }));
    }
    const transaction = builder.build();
    transaction.sign(getKeypairFromSecret(privateKey));
    const rawtx = transaction.toEnvelope().toXDR('base64');
    const id = await this.#api.transactions.propagate(rawtx);
    this.#balance = this.#balance + sendable;
    this.storage.set('balance', this.#balance.toString());
    await this.storage.save();
    return id;
  }

  #atomToUnit(value) {
    return utils.atomToUnit(value, this.crypto.decimals);
  }

  #unitToAtom(value) {
    return utils.unitToAtom(value, this.crypto.decimals);
  }
}
