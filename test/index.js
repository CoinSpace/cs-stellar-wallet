'use strict';

var assert = require('assert');
var Wallet = require('../');
var fixtures = require('./wallet');

describe('Stellar Wallet', function() {
  var readOnlyWallet;

  before(function() {
    readOnlyWallet = Wallet.deserialize(JSON.stringify(fixtures));
  });

  it('should have more tests', function() {
    assert.equal('hi', 'hi');
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
