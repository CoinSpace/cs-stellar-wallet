'use strict';

const assert = require('assert');
const Wallet = require('../');
const fixtures = require('./wallet');
// eslint-disable-next-line max-len
const RANDOM_SEED = '2b48a48a752f6c49772bf97205660411cd2163fe6ce2de19537e9c94d3648c85c0d7f405660c20253115aaf1799b1c41cdd62b4cfbb6845bc9475495fc64b874';
const RANDOM_SEED_PUB_KEY = 'GBBWU2HVQX52SZBQM2EIE5XGKJV2MXUSSHC4PX6C6MWJQAD6HECG5SKY';
const defaultOptions = {
  crypto: {
    platform: 'stellar',
    decimals: 7,
  },
  cache: { get: () => {}, set: () => {} },
};

describe('Stellar Wallet', () => {
  let readOnlyWallet;

  before(() => {
    readOnlyWallet = Wallet.deserialize(JSON.stringify(fixtures));
  });

  it('should have more tests', () => {
    assert.equal('hi', 'hi');
  });

  describe('constructor', () => {
    it('with seed', () => {
      const wallet = new Wallet({
        ...defaultOptions,
        seed: RANDOM_SEED,
      });
      assert.ok(wallet);
      assert.equal(wallet.isLocked, false);
    });

    it('with publicKey', () => {
      const wallet = new Wallet({
        ...defaultOptions,
        publicKey: readOnlyWallet.account.keypair.publicKey(),
      });
      assert.equal(wallet.addressString, readOnlyWallet.addressString);
      assert.equal(wallet.isLocked, true);
      assert.ok(wallet);
    });
  });

  describe('lock', () => {
    it('works', () => {
      const wallet = new Wallet({
        ...defaultOptions,
        seed: RANDOM_SEED,
      });
      assert.equal(wallet.isLocked, false);
      wallet.lock();
      assert.equal(wallet.account.keypair, null);
      assert.equal(wallet.isLocked, true);
    });
  });

  describe('unlock', () => {
    it('works', () => {
      const wallet = new Wallet({
        ...defaultOptions,
        publicKey: RANDOM_SEED_PUB_KEY,
      });
      assert.equal(wallet.isLocked, true);
      wallet.unlock(RANDOM_SEED);
      assert.ok(wallet.account.keypair.secret());
      assert.equal(wallet.isLocked, false);
    });
  });

  describe('publicKey', () => {
    it('works', () => {
      const wallet = new Wallet({
        ...defaultOptions,
        seed: RANDOM_SEED,
      });
      const publicKey = wallet.publicKey();
      assert.ok(publicKey);
    });

    it('key is valid', () => {
      const wallet = new Wallet({
        ...defaultOptions,
        seed: RANDOM_SEED,
      });
      const publicKey = wallet.publicKey();
      const secondWalet = new Wallet({
        ...defaultOptions,
        publicKey,
      });
      secondWalet.unlock(RANDOM_SEED);
      assert.equal(wallet.account.keypair.secret(), secondWalet.account.keypair.secret());
      assert.equal(wallet.addressString, secondWalet.addressString);
    });
  });

  describe('serialization & deserialization', () => {
    it('works', () => {
      assert.deepEqual(fixtures, JSON.parse(readOnlyWallet.serialize()));
    });
  });

  describe('createPrivateKey', () => {
    it('works', () => {
      const privateKey = readOnlyWallet.createPrivateKey(
        'SCJXKMOP5V66CV6MT2X2XUDDSMG7VGEEHYPFAEK3RT3ZJVSQ3BI7UUZY'
      );
      assert.equal(privateKey.secret(), 'SCJXKMOP5V66CV6MT2X2XUDDSMG7VGEEHYPFAEK3RT3ZJVSQ3BI7UUZY');
    });

    it('errors on invalid private key', ()=> {
      assert.throws(() => { readOnlyWallet.createPrivateKey('123'); });
    });
  });

  describe('exportPrivateKeys', () => {
    it('works', () => {
      const csv = readOnlyWallet.exportPrivateKeys();
      assert.equal(typeof csv, 'string');
      assert(csv, 'address,privatekey\n' + readOnlyWallet.account.address + ',' + readOnlyWallet.account.secret);
    });
  });

});
