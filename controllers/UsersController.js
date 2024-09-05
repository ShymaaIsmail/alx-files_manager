import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    // Check if the email already exists in the database
    const existingUser = await dbClient.db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Already exist' });
    }

    // Hash the password using SHA1
    const hashedPassword = sha1(password);

    // Insert the new user into the database
    try {
      const result = await dbClient.db.collection('users').insertOne({ email, password: hashedPassword });
      return res.status(201).json({ id: result.insertedId.toString(), email });
    } catch (error) {
      return res.status(500).json({ error: 'Error creating user' });
    }
  }
}

export default UsersController;
