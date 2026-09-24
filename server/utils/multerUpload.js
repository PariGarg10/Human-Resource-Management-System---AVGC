const multer = require('multer');
const { getUploadsRoot } = require('./storagePaths');
const { isS3Enabled, randomFilename, saveMulterFile } = require('./objectStorage');

/** Multer uploader that persists to S3 (memory) or local disk. */
function createMulterUploader(subdir, options = {}) {
  const storage = isS3Enabled()
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, getUploadsRoot(subdir)),
        filename: (_req, file, cb) => cb(null, randomFilename(file.originalname)),
      });

  const upload = multer({ storage, ...options });

  async function finalize(file) {
    if (!file) return null;
    if (isS3Enabled()) return saveMulterFile(subdir, file);
    return file.filename;
  }

  return { upload, finalize, subdir };
}

module.exports = { createMulterUploader };
