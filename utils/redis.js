import { createClient } from 'redis';

class RedisClient {
  constructor() {
    this.isConnected = false;
    this.client = createClient();
    this.client.on('error', (err) => {
      console.log(err);
      this.client.quit();
    });
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const value = await this.client.get(key);
    return value;
  }

  async set(key, value, duration) {
    await this.client.set(key, value,
      {
        EX: duration,
      });
  }

  async del(key) {
    const value = await this.client.del(key);
    return value;
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
