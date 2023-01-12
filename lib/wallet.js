import API from './api/index.js';
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
  errors,
  utlis,
} from 'cs-common';
import {
  getAddressFromSecret,
  getAddressFromSeed,
  getKeypairFromSecret,
  getKeypairFromSeed,
} from './helpers.js';

class StellarTransaction extends Transaction {
  get url() {
    if (this.development) {
      return `https://stellar.expert/explorer/testnet/tx/${this.id}`;
    }
    return `https://stellar.expert/explorer/public/tx/${this.id}`;
  }
}

export class InvalidMemoError extends errors.InvalidMetaError {
  name = 'InvalidMemoError';
  constructor(memo, options) {
    super(`Invalid Memo: "${memo}"`, {
      ...options,
      meta: 'memo',
    });
  }
}

// Stellar MAX_INT64
const MAX_INT64 = 9223372036854775807n;

export default class StellarWallet extends CsWallet {
  #api;
  #networkPassphrase;
  #dustThreshold = 1n;
  #address;
  #sequence = 0;
  #balance = 0n;
  #isActive = false;

  // memorized functions
  #getLedger;

  constructor(options = {}) {
    super(options);
    this.#api = new API(this);
    if (this.development) {
      this.#networkPassphrase = Networks.TESTNET;
    } else {
      this.#networkPassphrase = Networks.PUBLIC;
    }
    this.#getLedger = this.memoize(this._getLedger);
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
    /**
     * begin migration from string
     */
    if (typeof publicKey === 'string') {
      publicKey = {
        data: publicKey,
      };
    }
    // end migration
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
    const info = await this.#api.accounts.info(this.#address);
    this.#balance = this.#unitToAtom(info.balance);
    this.#sequence = info.sequence;
    this.#isActive = info.isActive;
    this.storage.set('balance', this.#balance.toString());
    await this.storage.save();
    this.state = CsWallet.STATE_LOADED;
  }

  async reload() {
    // TODO reload logic
  }

  async clenup() {
    await super.clenup();
    this.memoizeClear(this.#getLedger);
  }

  async loadTransactions({ cursor } = {}) {
    const data = await this.#api.accounts.txs(this.#address, cursor);
    return {
      transactions: this.#transformTxs(data.transactions),
      hasMore: data.hasMore,
      cursor: data.cursor,
    };
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
      id: tx.id,
      to,
      from: tx.from,
      amount: new Amount(amount, this.crypto.decimals),
      incoming,
      fee: new Amount(this.#unitToAtom(tx.fee), this.crypto.decimals),
      // TODO check timestamp
      timestamp: new Date(tx.timestamp),
      confirmed: true,
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

  async #getAccountInfo(address) {
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

  async validateAmount({ address, amount }) {
    super.validateAmount({ address, amount });
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

  async validateMeta({ address, memo }) {
    super.validateMeta({ address });
    if (memo !== undefined && Buffer.byteLength(memo, 'utf8') > 28) {
      throw new InvalidMemoError(memo);
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

  async estimateMaxAmount({ address }) {
    super.estimateMaxAmount({ address });
    const maxAmount = await this.#estimateMaxAmount();
    return new Amount(maxAmount, this.crypto.decimals);
  }

  async estimateTransactionFee({ address, amount }) {
    super.estimateTransactionFee({ address, amount });
    const ledger = await this.#getLedger();
    return new Amount(ledger.fee, this.crypto.decimals);
  }

  async createTransaction({ address, amount, memo }, seed) {
    super.createTransaction({ address, amount }, seed);
    const { value } = amount;
    const ledger = await this.#getLedger();
    const account = new Account(this.#address, this.#sequence.toFixed(0));
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
    if (memo) {
      builder.addMemo(Memo.text(memo));
    }
    const transaction = builder.build();
    transaction.sign(getKeypairFromSeed(seed));
    const rawtx = transaction.toEnvelope().toXDR().toString('base64');
    await this.#api.transactions.propagate(rawtx);
    this.#sequence++;
    this.#balance = this.#balance - value - ledger.fee;
    this.storage.set('balance', this.#balance.toString());
    // TODO should we return a transaction?
  }

  async #prepareImport(secret) {
    const address = getAddressFromSecret(secret);
    if (address === this.#address) {
      throw new errors.InvalidSecretError('Private key equal wallet private key');
    }
    const info = await this.#getAccountInfo(address);
    const balance = this.#unitToAtom(info.balance);
    const ledger = await this.#getLedger();
    const sendable = balance - ledger.minReserve - ledger.fee;
    return {
      address,
      balance,
      sendable,
      sequence: info.sequence,
    };
  }

  async estimateImport({ secret }) {
    super.estimateImport();
    const { address, sendable } = await this.#prepareImport(secret);
    const ledger = await this.#getLedger();
    if (this.#isActive === false && sendable < ledger.minReserve) {
      // TODO should it be an error or just return 0 amount?
      throw new errors.MinimumReserveDestinationError(new Amount(ledger.minReserve, this.crypto.decimals));
    }
    if (sendable < this.#dustThreshold) {
      // TODO should it be an error or just return 0 amount?
      throw new errors.SmallAmountError(this.#dustThreshold, this.crypto.decimals);
    }
    return {
      address,
      amount: new Amount(sendable > 0n ? sendable : 0n, this.crypto.decimals),
    };
  }

  async createImport({ secret }) {
    super.createImport();
    const { address, sendable, sequence } = await this.#prepareImport(secret);
    const ledger = await this.#getLedger();

    const account = new Account(address, sequence.toFixed(0));
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
    transaction.sign(getKeypairFromSecret(secret));
    const rawtx = transaction.toEnvelope().toXDR().toString('base64');
    await this.#api.transactions.propagate(rawtx);
    this.#balance = this.#balance + sendable;
    this.storage.set('balance', this.#balance.toString());
    // TODO should we return a transaction?
  }

  #atomToUnit(value) {
    return utlis.atomToUnit(value, this.crypto.decimals);
  }

  #unitToAtom(value) {
    return utlis.unitToAtom(value, this.crypto.decimals);
  }
}
