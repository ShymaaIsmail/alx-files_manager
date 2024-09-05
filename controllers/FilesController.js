import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';
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
      res.json(file);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
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
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = FilesController;
