const { MongoClient } = require('mongodb');

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';
    this.uri = `mongodb://${host}:${port}/${database}`;
    this.client = new MongoClient(this.uri, { useNewUrlParser: true, useUnifiedTopology: true });
    this.db = null;
  }

  async connect() {
    if (!this.db) {
      try {
        await this.client.connect();
        this.db = this.client.db();
        return true;
      } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        return false;
      }
    }
    return true;
  }

  async isAlive() {
    return this.db !== null && this.client.isConnected();
  }

  async nbUsers() {
    await this.connect();
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    await this.connect();
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();

module.exports = dbClient;
