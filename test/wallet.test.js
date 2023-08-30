import { Amount } from '@coinspace/cs-common';
import Wallet from '@coinspace/cs-stellar-wallet';
import assert from 'assert/strict';
import sinon from 'sinon';

// eslint-disable-next-line max-len
const RANDOM_SEED = Buffer.from('2b48a48a752f6c49772bf97205660411cd2163fe6ce2de19537e9c94d3648c85c0d7f405660c20253115aaf1799b1c41cdd62b4cfbb6845bc9475495fc64b874', 'hex');
const RANDOM_SEED_PUB_KEY = 'GBBWU2HVQX52SZBQM2EIE5XGKJV2MXUSSHC4PX6C6MWJQAD6HECG5SKY';
const RANDOM_ADDRESS = 'GBBWU2HVQX52SZBQM2EIE5XGKJV2MXUSSHC4PX6C6MWJQAD6HECG5SKY';
const RANDOM_SECRET = 'SAVURJEKOUXWYSLXFP4XEBLGAQI42ILD7ZWOFXQZKN7JZFGTMSGILGFH';
const SECOND_ADDRESS = 'GDRWZSZYP42OBP3J4UMEG64XOIB62K2YE2THTLYSZF4WRNWSRDYNPJUT';
const SECOND_SECRET = 'SCJXKMOP5V66CV6MT2X2XUDDSMG7VGEEHYPFAEK3RT3ZJVSQ3BI7UUZY';
const stellarAtStellar = {
  _id: 'stellar@stellar',
  asset: 'stellar',
  platform: 'stellar',
  type: 'coin',
  decimals: 7,
};
const defaultOptions = {
  crypto: stellarAtStellar,
  platform: stellarAtStellar,
  cache: { get() {}, set() {} },
  settings: { get() {}, set() {} },
  account: {
    request(...args) { console.log(args); },
  },
  apiNode: 'node',
  storage: { get() {}, set() {}, save() {} },
};

describe('Stellar Wallet', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('create wallet instance', () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      assert.equal(wallet.state, Wallet.STATE_CREATED);
    });
  });

  describe('create wallet', () => {
    it('should create new wallet with seed', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, RANDOM_ADDRESS);
    });

    it('should fails without seed', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await assert.rejects(async () => {
        await wallet.create();
      }, {
        name: 'TypeError',
        message: 'seed must be an instance of Uint8Array or Buffer, undefined provided',
      });
    });
  });

  describe('open wallet', () => {
    it('should open wallet with public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, RANDOM_ADDRESS);
    });

    it('should fails without public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await assert.rejects(async () => {
        await wallet.open();
      }, {
        name: 'TypeError',
        message: 'publicKey must be an instance of Object with data property',
      });
    });
  });

  describe('storage', () => {
    it('should load initial balance from storage', async () => {
      sinon.stub(defaultOptions.storage, 'get')
        .withArgs('balance').returns('1234567890');
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      assert.equal(wallet.balance.value, 1234567890n);
    });
  });

  describe('load', () => {
    it('should load wallet', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${RANDOM_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 12.345,
          sequence: 1,
          isActive: true,
        });
      const storage = sinon.mock(defaultOptions.storage);
      storage.expects('set').once().withArgs('balance', '123450000');
      storage.expects('save').once();
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await wallet.load();
      assert.equal(wallet.state, Wallet.STATE_LOADED);
      assert.equal(wallet.balance.value, 123450000n);
      storage.verify();
    });

    it('should set STATE_ERROR on error', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      sinon.stub(defaultOptions.account, 'request');
      await assert.rejects(async () => {
        await wallet.load();
      });
      assert.equal(wallet.state, Wallet.STATE_ERROR);
    });
  });

  describe('getPublicKey', () => {
    it('should export public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      const publicKey = wallet.getPublicKey();
      assert.deepEqual(publicKey, { data: RANDOM_SEED_PUB_KEY });
    });

    it('public key is valid', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      const publicKey = wallet.getPublicKey();
      const secondWalet = new Wallet({
        ...defaultOptions,
      });
      secondWalet.open(publicKey);
      assert.equal(wallet.address, secondWalet.address);
    });
  });

  describe('getPrivateKey', () => {
    it('should export private key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      const privateKey = wallet.getPrivateKey(RANDOM_SEED);
      assert.deepEqual(privateKey, [{
        address: RANDOM_ADDRESS,
        secret: RANDOM_SECRET,
      }]);
    });
  });

  describe('estimateMaxAmount', () => {
    it('should correct estimate max amount', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${RANDOM_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 12.345,
          sequence: 1,
          isActive: true,
        }).withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/ledger',
          baseURL: 'node',
        }).resolves({
          baseFee: 0.0008025,
          baseReserve: 0.5,
        });
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await wallet.load();
      const maxAmount = await wallet.estimateMaxAmount({ address: SECOND_ADDRESS });
      // 123450000n - 8025n - 10000000n
      assert.equal(maxAmount.value, 113441975n);
    });

    it('should estimate max amount to be 0', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${RANDOM_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 1,
          sequence: 1,
          isActive: true,
        }).withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/ledger',
          baseURL: 'node',
        }).resolves({
          baseFee: 0.0008025,
          baseReserve: 0.5,
        });
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await wallet.load();
      const maxAmount = await wallet.estimateMaxAmount({ address: SECOND_ADDRESS });
      assert.equal(maxAmount.value, 0n);
    });
  });

  describe('estimateTransactionFee', () => {
    it('should estimate transaction fee', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${RANDOM_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 10,
          sequence: 1,
          isActive: true,
        }).withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/ledger',
          baseURL: 'node',
        }).resolves({
          baseFee: 0.0008025,
          baseReserve: 0.5,
        });
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await wallet.load();
      const fee = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(1n, wallet.crypto.decimals),
      });
      assert.equal(fee.value, 8025n);
    });
  });

  describe('validators', () => {
    describe('validateAddress', () => {
      let wallet;
      beforeEach(async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${RANDOM_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 12.345,
            sequence: 1,
            isActive: true,
          });
        wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open({ data: RANDOM_SEED_PUB_KEY });
        await wallet.load();
      });

      it('valid address', async () => {
        assert.ok(await wallet.validateAddress({ address: SECOND_ADDRESS }));
      });

      it('invalid address', async () => {
        await assert.rejects(async () => {
          await wallet.validateAddress({ address: '123' });
        }, {
          name: 'InvalidAddressError',
          message: 'Invalid address "123"',
        });
      });

      it('own address', async () => {
        await assert.rejects(async () => {
          await wallet.validateAddress({ address: RANDOM_ADDRESS });
        }, {
          name: 'DestinationEqualsSourceError',
          message: 'Destination address equals source address',
        });
      });
    });

    describe('validateAmount', () => {
      it('should be valid amount', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${RANDOM_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 20,
            sequence: 1,
            isActive: true,
          }).withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${SECOND_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 10,
            sequence: 1,
            isActive: true,
          })
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/ledger',
            baseURL: 'node',
          }).resolves({
            baseFee: 0.0008025,
            baseReserve: 0.5,
          });
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open({ data: RANDOM_SEED_PUB_KEY });
        await wallet.load();

        const valid = await wallet.validateAmount({
          address: SECOND_ADDRESS,
          amount: new Amount(5_0000000n, wallet.crypto.decimals),
        });
        assert.ok(valid);
      });

      it('throw on inactive account', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${RANDOM_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 0,
            sequence: 1,
            isActive: false,
          });
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open({ data: RANDOM_SEED_PUB_KEY });
        await wallet.load();

        await assert.rejects(async () => {
          await wallet.validateAmount({
            address: SECOND_ADDRESS,
            amount: new Amount(123n, wallet.crypto.decimals),
          });
        }, {
          name: 'SmallAmountError',
          message: 'Small amount',
          amount: new Amount(1n, wallet.crypto.decimals),
        });
      });

      it('throw on small amount', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${RANDOM_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 12.345,
            sequence: 1,
            isActive: true,
          });
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open({ data: RANDOM_SEED_PUB_KEY });
        await wallet.load();

        await assert.rejects(async () => {
          await wallet.validateAmount({
            address: SECOND_ADDRESS,
            amount: new Amount(0n, wallet.crypto.decimals),
          });
        }, {
          name: 'SmallAmountError',
          message: 'Small amount',
          amount: new Amount(1n, wallet.crypto.decimals),
        });
      });

      it('throw on big amount', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${RANDOM_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 12.345,
            sequence: 1,
            isActive: true,
          }).withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/ledger',
            baseURL: 'node',
          }).resolves({
            baseFee: 0.0008025,
            baseReserve: 0.5,
          });
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open({ data: RANDOM_SEED_PUB_KEY });
        await wallet.load();

        await assert.rejects(async () => {
          await wallet.validateAmount({
            address: SECOND_ADDRESS,
            amount: new Amount(200_0000000n, wallet.crypto.decimals),
          });
        }, {
          name: 'BigAmountError',
          message: 'Big amount',
          amount: new Amount(113441975n, wallet.crypto.decimals),
        });
      });

      it('throw on amount less then min reserve', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${RANDOM_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 12.345,
            sequence: 1,
            isActive: true,
          })
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${SECOND_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 0,
            sequence: 1,
            isActive: false,
          })
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/ledger',
            baseURL: 'node',
          }).resolves({
            baseFee: 0.0008025,
            baseReserve: 0.5,
          });
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open({ data: RANDOM_SEED_PUB_KEY });
        await wallet.load();

        await assert.rejects(async () => {
          await wallet.validateAmount({
            address: SECOND_ADDRESS,
            amount: new Amount(5000000n, wallet.crypto.decimals),
          });
        }, {
          name: 'MinimumReserveDestinationError',
          message: 'Less than minimum reserve on destination address',
          amount: new Amount(10000000n, wallet.crypto.decimals),
        });
      });
    });

    describe('validateMeta', () => {
      let wallet;
      beforeEach(async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/account/${RANDOM_ADDRESS}`,
            baseURL: 'node',
          }).resolves({
            balance: 12.345,
            sequence: 1,
            isActive: true,
          });
        wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open({ data: RANDOM_SEED_PUB_KEY });
        await wallet.load();
      });

      it('should support meta', () => {
        assert.ok(wallet.isMetaSupported);
      });

      it('empty meta is valid', async () => {
        assert.ok(await wallet.validateMeta({
          address: SECOND_ADDRESS,
        }));
      });

      it('valid memo', async () => {
        assert.ok(await wallet.validateMeta({
          address: SECOND_ADDRESS,
          memo: {
            memo: '12345',
          },
        }));
      });

      it('should throw invalid memo', async () => {
        await assert.rejects(async () => {
          await wallet.validateMeta({
            address: SECOND_ADDRESS,
            meta: {
              memo: '1234567890abcdef1234567890abcdef',
            },
          });
        }, {
          name: 'InvalidMemoError',
          message: 'Invalid Memo: "1234567890abcdef1234567890abcdef"',
          meta: 'memo',
        });
      });
    });
  });

  describe('createTransaction', () => {
    it('should create valid transaction', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${RANDOM_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 20,
          sequence: 1,
          isActive: true,
        })
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${SECOND_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 10,
          sequence: 1,
          isActive: true,
        })
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/ledger',
          baseURL: 'node',
        }).resolves({
          baseFee: 0.0008025,
          baseReserve: 0.5,
        })
        .withArgs({
          seed: 'device',
          method: 'POST',
          url: 'api/v1/tx/send',
          data: sinon.match.any,
          baseURL: 'node',
        }).resolves({
          txId: '123456',
        });
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await wallet.load();

      const id = await wallet.createTransaction({
        address: SECOND_ADDRESS,
        amount: new Amount(5_0000000, wallet.crypto.decimals),
      }, RANDOM_SEED);
      assert.equal(wallet.balance.value, 14_9991975n);
      assert.equal(id, '123456');
    });
  });

  describe('estimateImport', () => {
    it('works', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${RANDOM_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 12.345,
          sequence: 1,
          isActive: true,
        })
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${SECOND_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 100500,
          sequence: 1,
          isActive: true,
        })
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/ledger',
          baseURL: 'node',
        }).resolves({
          baseFee: 0.0008025,
          baseReserve: 0.5,
        });
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await wallet.load();
      const estimation = await wallet.estimateImport({
        privateKey: SECOND_SECRET,
      });
      assert.equal(estimation.value, 1004989991975n);
    });

    it('throw error on invalid private key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await assert.rejects(async () => {
        await wallet.estimateImport({ privateKey: '123' });
      }, {
        name: 'InvalidPrivateKeyError',
        message: 'Invalid private key',
      });
    });

    it('throw error on own private key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await assert.rejects(async () => {
        await wallet.estimateImport({ privateKey: RANDOM_SECRET });
      },
      {
        name: 'InvalidPrivateKeyError',
        message: 'Private key equal wallet private key',
      });
    });
  });

  describe('createImport', () => {
    it('should support import', () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      assert.ok(wallet.isImportSupported);
    });

    it('should create import transaction', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${RANDOM_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 20,
          sequence: 1,
          isActive: true,
        })
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/account/${SECOND_ADDRESS}`,
          baseURL: 'node',
        }).resolves({
          balance: 30,
          sequence: 1,
          isActive: true,
        })
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/ledger',
          baseURL: 'node',
        }).resolves({
          baseFee: 0.0008025,
          baseReserve: 0.5,
        })
        .withArgs({
          seed: 'device',
          method: 'POST',
          url: 'api/v1/tx/send',
          data: sinon.match.any,
          baseURL: 'node',
        }).resolves({
          txId: '123456',
        });
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({ data: RANDOM_SEED_PUB_KEY });
      await wallet.load();

      const id = await wallet.createImport({
        privateKey: SECOND_SECRET,
      });
      assert.equal(wallet.balance.value, 48_9991975n);
      assert.equal(id, '123456');
    });
  });
});
