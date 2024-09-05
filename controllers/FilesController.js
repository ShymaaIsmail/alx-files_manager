import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';
import mime from 'mime-types';
import dbClient from '../utils/db'; // Ensure this file exports a connected MongoDB client instance
import redisClient from '../utils/redis';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Helper function to check if a file is a folder
const isFolder = (type) => type === 'folder';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!['folder', 'file', 'image'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!isFolder(type) && !data) return res.status(400).json({ error: 'Missing data' });

    // Check parentId validity
    if (parentId !== 0) {
      const parentFile = await dbClient.files.findOne({ _id: new dbClient.ObjectId(parentId) });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (!isFolder(parentFile.type)) return res.status(400).json({ error: 'Parent is not a folder' });
    }

    // For folders, only create the document in the database
    if (isFolder(type)) {
      const file = {
        userId,
        name,
        type,
        isPublic,
        parentId: new dbClient.ObjectId(parentId),
      };

      const result = await dbClient.files.insertOne(file);
      return res.status(201).json({
        id: result.insertedId,
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
    }

    // Handle file or image types
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!await existsAsync(folderPath)) await mkdirAsync(folderPath, { recursive: true });

    const fileUuid = uuidv4();
    const filePath = path.join(folderPath, fileUuid);

    await writeFileAsync(filePath, Buffer.from(data, 'base64'));

    const file = {
      userId,
      name,
      type,
      isPublic,
      parentId: new dbClient.ObjectId(parentId),
      localPath: filePath,
    };

    const result = await dbClient.files.insertOne(file);
    return res.status(201).json({
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
      localPath: filePath,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    try {
      const file = await dbClient.files.findOne({ _id: new dbClient.ObjectId(id), userId });
      if (!file) return res.status(404).json({ error: 'Not found' });
      return res.json(file); // Ensure to return the response
    } catch (err) {
      return res.status(500).json({ error: 'Server error' }); // Ensure to return the response
    }
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { parentId = 0, page = 0 } = req.query;
    const limit = 20;
    const skip = page * limit;

    try {
      const files = await dbClient.files.aggregate([
        { $match: { userId, parentId: new dbClient.ObjectId(parentId) } },
        { $skip: skip },
        { $limit: limit },
      ]).toArray();
      return res.json(files); // Ensure to return the response
    } catch (err) {
      return res.status(500).json({ error: 'Server error' }); // Ensure to return the response
    }
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    try {
      const result = await dbClient.files.findOneAndUpdate(
        { _id: new dbClient.ObjectId(id), userId },
        { $set: { isPublic: true } },
        { returnDocument: 'after' },
      );

      if (!result.value) return res.status(404).json({ error: 'Not found' });

      return res.json(result.value); // Ensure to return the response
    } catch (err) {
      return res.status(500).json({ error: 'Server error' }); // Ensure to return the response
    }
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    try {
      const result = await dbClient.files.findOneAndUpdate(
        { _id: new dbClient.ObjectId(id), userId },
        { $set: { isPublic: false } },
        { returnDocument: 'after' },
      );

      if (!result.value) return res.status(404).json({ error: 'Not found' });

      return res.json(result.value); // Ensure to return the response
    } catch (err) {
      return res.status(500).json({ error: 'Server error' }); // Ensure to return the response
    }
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    try {
      const file = await dbClient.files.findOne({ _id: new dbClient.ObjectId(id) });
      if (!file) return res.status(404).json({ error: 'Not found' });

      // Check if file is public or if the user is the owner
      if (!file.isPublic && file.userId !== userId) return res.status(404).json({ error: 'Not found' });

      // Check if the type is a folder
      if (isFolder(file.type)) return res.status(400).json({ error: "A folder doesn't have content" });

      // Check if the file exists locally
      if (!await existsAsync(file.localPath)) return res.status(404).json({ error: 'Not found' });

      // Get the MIME type of the file
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';

      // Send the file content
      res.setHeader('Content-Type', mimeType);
      const fileContent = await fs.promises.readFile(file.localPath);
      return res.send(fileContent); // Ensure consistent return value here
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = FilesController;
