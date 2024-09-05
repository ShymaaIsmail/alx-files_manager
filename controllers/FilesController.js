import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { promisify } = require('util');

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
    if (!['folder', 'file', 'image'].includes(type)) return res.status(400).json({ error: 'Missing type' });
    if (!isFolder(type) && !data) return res.status(400).json({ error: 'Missing data' });

    // Check parentId validity
    if (parentId !== 0) {
      const parentFile = await dbClient.files.findOne({ _id: parentId });
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
        parentId,
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
    const filePath = `${folderPath}/${fileUuid}`;

    await writeFileAsync(filePath, Buffer.from(data, 'base64'));

    const file = {
      userId,
      name,
      type,
      isPublic,
      parentId,
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
}

module.exports = FilesController;
