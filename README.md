# cs-stellar-wallet

[![Build](https://github.com/CoinSpace/cs-stellar-wallet/actions/workflows/ci.yml/badge.svg)](https://github.com/CoinSpace/cs-stellar-wallet/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/tag/CoinSpace/cs-stellar-wallet?label=version)](https://github.com/CoinSpace/cs-stellar-wallet/releases)
[![License](https://img.shields.io/github/license/CoinSpace/cs-stellar-wallet?color=blue)](https://github.com/CoinSpace/cs-stellar-wallet/blob/master/LICENSE)

Stellar wallet for [Coin Wallet](https://github.com/CoinSpace/CoinSpace).

## Notes

To skip `sodium-native` build use this:
```
# /usr/local/Cellar/autoconf/2.69/autoreconf
if ($ENV{'npm_package_homepage'} eq 'https://github.com/sodium-friends/sodium-native') {
  print STDERR "SKIP: sodium-native\n";
  exit 0;
}
```
