const fs = require('fs');
const path = require('path');
const { getUploadsRoot } = require('./storagePaths');

let s3Client = null;

function isS3Enabled() {
  return process.env.AWS_S3_UPLOADS_ENABLED === 'true' && Boolean(process.env.S3_UPLOADS_BUCKET);
}

function getBucket() {
  return process.env.S3_UPLOADS_BUCKET;
}

function getRegion() {
  return process.env.S3_UPLOADS_REGION || process.env.AWS_REGION || 'ap-south-1';
}

function getClient() {
  if (!s3Client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({ region: getRegion() });
  }
  return s3Client;
}

function objectKey(subdir, filename) {
  const sub = String(subdir || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/');
  const name = path.basename(String(filename || ''));
  return sub ? `${sub}/${name}` : name;
}

function uploadsUrl(subdir, filename) {
  return `/uploads/${objectKey(subdir, filename)}`;
}

function parseUploadsPath(urlOrPath) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return null;
  const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, '');
  const m = withoutOrigin.match(/^\/?uploads\/(.+)$/i);
  if (!m) return null;
  const segments = m[1].split('/').filter(Boolean);
  if (!segments.length) return null;
  const filename = segments.pop();
  const subdir = segments.join('/');
  return { subdir, filename, key: objectKey(subdir, filename) };
}

function localFilePath(subdir, filename) {
  return path.join(getUploadsRoot(subdir), path.basename(filename));
}

function randomFilename(originalName, maxExt = 16) {
  const ext = path.extname(originalName || '').slice(0, maxExt).toLowerCase();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
}

async function putBuffer(subdir, filename, buffer, contentType) {
  const name = path.basename(filename);
  const key = objectKey(subdir, name);
  if (isS3Enabled()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await getClient().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      })
    );
    return name;
  }
  const fp = localFilePath(subdir, name);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, buffer);
  return name;
}

async function exists(subdir, filename) {
  const name = path.basename(filename);
  if (isS3Enabled()) {
    try {
      const { HeadObjectCommand } = require('@aws-sdk/client-s3');
      await getClient().send(
        new HeadObjectCommand({ Bucket: getBucket(), Key: objectKey(subdir, name) })
      );
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }
  return fs.existsSync(localFilePath(subdir, name));
}

async function getBuffer(subdir, filename) {
  const name = path.basename(filename);
  if (isS3Enabled()) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const out = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: objectKey(subdir, name) })
    );
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const fp = localFilePath(subdir, name);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp);
}

async function getStream(subdir, filename) {
  const name = path.basename(filename);
  if (isS3Enabled()) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const out = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: objectKey(subdir, name) })
    );
    return { stream: out.Body, contentType: out.ContentType || null };
  }
  const fp = localFilePath(subdir, name);
  if (!fs.existsSync(fp)) return null;
  return { stream: fs.createReadStream(fp), contentType: null };
}

async function deleteObject(subdir, filename) {
  const name = path.basename(filename);
  if (isS3Enabled()) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await getClient().send(
      new DeleteObjectCommand({ Bucket: getBucket(), Key: objectKey(subdir, name) })
    );
    return;
  }
  const fp = localFilePath(subdir, name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

async function saveMulterFile(subdir, file) {
  if (!file) return null;
  const filename = file.filename || randomFilename(file.originalname);
  if (file.buffer) {
    await putBuffer(subdir, filename, file.buffer, file.mimetype);
    return filename;
  }
  if (file.path && fs.existsSync(file.path)) {
    const buffer = fs.readFileSync(file.path);
    await putBuffer(subdir, filename, buffer, file.mimetype);
    try {
      fs.unlinkSync(file.path);
    } catch (_e) {
      /* ignore */
    }
    return filename;
  }
  return filename;
}

async function pipeToResponse(subdir, filename, res, options = {}) {
  const hit = await getStream(subdir, filename);
  if (!hit) return false;
  if (options.contentType) res.setHeader('Content-Type', options.contentType);
  else if (hit.contentType) res.setHeader('Content-Type', hit.contentType);
  if (options.disposition) res.setHeader('Content-Disposition', options.disposition);
  if (options.cacheControl) res.setHeader('Cache-Control', options.cacheControl);
  hit.stream.pipe(res);
  return true;
}

/** Serve GET /uploads/... from S3 when enabled. */
async function tryServeUploadsRequest(reqPath, res) {
  if (!isS3Enabled()) return false;
  const parsed = parseUploadsPath(reqPath.startsWith('/uploads') ? reqPath : `/uploads${reqPath}`);
  if (!parsed) return false;
  const ok = await exists(parsed.subdir, parsed.filename);
  if (!ok) return false;
  return pipeToResponse(parsed.subdir, parsed.filename, res, { cacheControl: 'private, max-age=3600' });
}

async function resolveUploadsUrl(urlOrPath) {
  const parsed = parseUploadsPath(urlOrPath);
  if (!parsed) return null;
  const ok = await exists(parsed.subdir, parsed.filename);
  if (!ok) return null;
  if (isS3Enabled()) {
    return { subdir: parsed.subdir, filename: parsed.filename, buffer: await getBuffer(parsed.subdir, parsed.filename) };
  }
  return { subdir: parsed.subdir, filename: parsed.filename, localPath: localFilePath(parsed.subdir, parsed.filename) };
}

module.exports = {
  isS3Enabled,
  objectKey,
  uploadsUrl,
  parseUploadsPath,
  localFilePath,
  randomFilename,
  putBuffer,
  exists,
  getBuffer,
  getStream,
  deleteObject,
  saveMulterFile,
  pipeToResponse,
  tryServeUploadsRequest,
  resolveUploadsUrl,
};
