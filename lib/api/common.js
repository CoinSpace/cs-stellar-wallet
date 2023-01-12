export default class Common {
  #wallet;
  constructor(wallet) {
    this.#wallet = wallet;
  }
  async ledger() {
    const data = await this.#wallet.requestNode({
      method: 'GET',
      url: 'api/v1/ledger',
    });
    return data;
  }
}
