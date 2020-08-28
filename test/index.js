'use strict';

var assert = require('assert');
var Wallet = require('../');
var fixtures = require('./wallet');
// eslint-disable-next-line max-len
var RANDOM_SEED = '2b48a48a752f6c49772bf97205660411cd2163fe6ce2de19537e9c94d3648c85c0d7f405660c20253115aaf1799b1c41cdd62b4cfbb6845bc9475495fc64b874';

describe('Stellar Wallet', function() {
  var readOnlyWallet;

  before(function() {
    readOnlyWallet = Wallet.deserialize(JSON.stringify(fixtures));
  });

  it('should have more tests', function() {
    assert.equal('hi', 'hi');
  });

  describe('constructor', function() {
    it('with seed', function() {
      var wallet = new Wallet({
        networkName: 'stellar',
        seed: RANDOM_SEED
      });
      assert.ok(wallet);
      assert.equal(wallet.isLocked, false);
    });

    it('with publicKey', function() {
      var wallet = new Wallet({
        networkName: 'stellar',
        publicKey: readOnlyWallet.account.keypair.publicKey()
      });
      assert.equal(wallet.addressString, readOnlyWallet.addressString);
      assert.equal(wallet.isLocked, true);
      assert.ok(wallet);
    });
  });

  describe('lock', function() {
    it('works', function() {
      var wallet = new Wallet({
        networkName: 'stellar',
        seed: RANDOM_SEED
      });
      assert.equal(wallet.isLocked, false);
      wallet.lock();
      assert.equal(wallet.account.keypair, null);
      assert.equal(wallet.isLocked, true);
    });
  });

  describe('unlock', function() {
    it('works', function() {
      var wallet = new Wallet({
        networkName: 'stellar',
        publicKey: readOnlyWallet.account.keypair.publicKey()
      });
      assert.equal(wallet.isLocked, true);
      wallet.unlock(readOnlyWallet.account.keypair.secret());
      assert.equal(wallet.account.keypair.secret(), readOnlyWallet.account.keypair.secret());
      assert.equal(wallet.isLocked, false);
    });
  });

  describe('dumpKeys', function() {
    it('works', function() {
      var wallet = new Wallet({
        networkName: 'stellar',
        seed: RANDOM_SEED
      });
      var keys = wallet.dumpKeys();
      assert.ok(keys);
      assert.ok(keys.private);
      assert.ok(keys.public);
    });

    it('dumped keys are valid', function() {
      var wallet = new Wallet({
        networkName: 'stellar',
        seed: RANDOM_SEED
      });
      var keys = wallet.dumpKeys();
      var secondWalet = new Wallet({
        networkName: 'stellar',
        publicKey: keys.public
      });
      secondWalet.unlock(keys.private);
      assert.equal(wallet.account.keypair.secret(), secondWalet.account.keypair.secret());
      assert.equal(wallet.addressString, secondWalet.addressString);
    });
  });

  describe('serialization & deserialization', function() {
    it('works', function() {
      assert.deepEqual(fixtures, JSON.parse(readOnlyWallet.serialize()));
    });
  });

  describe('createPrivateKey', function() {
    it('works', function() {
      var privateKey = readOnlyWallet.createPrivateKey(
        'SCJXKMOP5V66CV6MT2X2XUDDSMG7VGEEHYPFAEK3RT3ZJVSQ3BI7UUZY'
      );
      assert.equal(privateKey.secret(), 'SCJXKMOP5V66CV6MT2X2XUDDSMG7VGEEHYPFAEK3RT3ZJVSQ3BI7UUZY');
    });

    it('errors on invalid private key', function(){
      assert.throws(function() { readOnlyWallet.createPrivateKey('123'); });
    });
  });

  describe('exportPrivateKeys', function() {
    it('works', function() {
      var csv = readOnlyWallet.exportPrivateKeys();
      assert.equal(typeof csv, 'string');
      assert(csv, 'address,privatekey\n' + readOnlyWallet.account.address + ',' + readOnlyWallet.account.secret);
    });
  });

});
