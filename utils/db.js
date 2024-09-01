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
    try {
      await this.client.connect();
      this.db = this.client.db();
      return true;
    } catch (error) {
      console.error('Failed to connect to MongoDB', error);
      return false;
    }
  }

  async isAlive() {
    const isConnected = await this.connect();
    return isConnected;
  }

  async nbUsers() {
    if (!this.db) {
      await this.connect();
    }
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    if (!this.db) {
      await this.connect();
    }
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();

module.exports = dbClient;
