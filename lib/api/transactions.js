export default class Transactions {
  #wallet;
  constructor(wallet) {
    this.#wallet = wallet;
  }
  async get(txId) {
    const data = await this.#wallet.requestNode({
      method: 'GET',
      url: `api/v1/tx/${txId}`,
    });
    return data.tx;
  }
  async propagate(rawtx) {
    const data = await this.#wallet.requestNode({
      method: 'POST',
      url: 'api/v1/tx/send',
      data: {
        rawtx,
      },
    });
    return data.txId;
  }
}
