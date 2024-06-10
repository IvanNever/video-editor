const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const { pipeline } = require("node:stream/promises");
const util = require("../../lib/util");
const DB = require("../DB");
const FF = require("../../lib/FF");

const getVideos = (req, res, handleErr) => {
  DB.update();

  const videos = DB.videos.filter((video) => video.userId === req.userId);

  res.status(200).json(videos);
};

const uploadVideo = async (req, res, handleErr) => {
  const specifiedFileName = req.headers.filename;
  const extension = path.extname(specifiedFileName).substring(1).toLowerCase();
  const name = path.parse(specifiedFileName).name;
  const videoId = crypto.randomBytes(4).toString("hex");

  const FORMATS_SUPPORTED = ["mov", "mp4"];
  if (!FORMATS_SUPPORTED.includes(extension)) {
    return handleErr({
      status: 400,
      message: "Only these formats are allowed: mov, mp4",
    });
  }

  const folderPath = `./storage/${videoId}`;

  try {
    await fs.mkdir(folderPath);
    const fullPath = `${folderPath}/original.${extension}`;
    const file = await fs.open(fullPath, "w");
    const fileStream = file.createWriteStream();
    const thumbnailPath = `./storage/${videoId}/thumbnail.jpg`;

    await pipeline(req, fileStream);

    await FF.makeThumbnail(fullPath, thumbnailPath);

    const dimensions = await FF.getDimensions(fullPath);

    DB.update();
    DB.videos.unshift({
      id: DB.videos.length,
      videoId,
      name,
      extension,
      dimensions,
      userId: req.userId,
      extractedAudio: false,
      resizes: {},
    });
    DB.save();

    res.status(201).json({
      status: "success",
      message: "The file was uploaded successfully",
    });
  } catch (err) {
    await util.deleteFolder(folderPath);
    if (err.code !== "ECONNRESET") return handleErr(err);
  }
};

const extractAudio = async (req, res, handleErr) => {
  const videoId = req.params.get("videoId");
  DB.update();
  const video = DB.videos.find((video) => video.videoId === videoId);

  if (!video) {
    return handleErr({
      status: 404,
      message: "Video not found!",
    });
  }

  if (video.extractedAudio) {
    return handleErr({
      status: 400,
      message: "The audio has been already extracted for this video",
    });
  }

  try {
    const originalVideoPath = `./storage/${videoId}/original.${video.extension}`;
    const targetAudioPath = `./storage/${videoId}/audio.aac`;

    await FF.extractAudio(originalVideoPath, targetAudioPath);

    video.extractedAudio = true;
    DB.save();

    res.status(200).json({
      status: "success",
      message: "The audio was extracted successfully!",
    });
  } catch (err) {
    util.deleteFile(targetAudioPath);
    return handleErr(err);
  }
};

const getVideoAsset = async (req, res, handleErr) => {
  const videoId = req.params.get("videoId");
  const type = req.params.get("type");

  DB.update();

  const video = DB.videos.find((video) => video.videoId === videoId);

  if (!video) {
    return handleErr({
      status: 404,
      message: "Video not found!",
    });
  }

  let file;
  let mimeType;
  let filename;

  switch (type) {
    case "thumbnail":
      file = await fs.open(`./storage/${videoId}/thumbnail.jpg`, "r");
      mimeType = "image/jpeg";
      break;
    case "audio":
      file = await fs.open(`./storage/${videoId}/audio.aac`, "r");
      mimeType = "audio/aac";
      filename = `${video.name}-audio.aac`;
      break;
    case "resize":
      const dimansions = res.params.get("dimensions");
      file = await fs.open(
        `./storage/${videoId}/${dimansions}.${video.extension}`,
        "r"
      );
      mimeType = "video/mp4";
      filename = `${video.name}-${dimansions}.${video.extension}`;
      break;
    case "original":
      file = await fs.open(
        `./storage/${videoId}/original.${video.extension}`,
        "r"
      );
      mimeType = "video/mp4";
      filename = `${video.name}.${video.extension}`;
      break;
  }

  try {
    const stat = await file.stat();

    const fileStream = file.createReadStream();

    if (type !== "thumbnail") {
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    }

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", stat.size);

    res.status(200);

    await pipeline(fileStream, res);

    file.close();
  } catch (err) {}
};

const controller = {
  uploadVideo,
  getVideos,
  extractAudio,
  getVideoAsset,
};

module.exports = controller;
