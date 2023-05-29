export default class Accounts {
  #wallet;
  constructor(wallet) {
    this.#wallet = wallet;
  }
  async info(address) {
    const data = await this.#wallet.requestNode({
      method: 'GET',
      url: `api/v1/account/${address}`,
    });
    return {
      sequence: parseInt(data.sequence),
      balance: data.balance,
      isActive: data.isActive,
    };
  }
  async txs(address, cursor) {
    const data = await this.#wallet.requestNode({
      method: 'GET',
      url: `api/v1/account/${address}/txs`,
      params: {
        cursor,
      },
    });
    const hasMore = data.txs.length === data.limit;
    return {
      transactions: data.txs,
      hasMore,
      cursor: hasMore && data.txs[data.txs.length - 1].cursor,
    };
  }
}
