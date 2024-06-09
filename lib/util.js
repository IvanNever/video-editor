const fs = require("node:fs/promises");

const util = {};

util.deleteFile = async (path) => {
  try {
    await fs.unlink(path)
  } catch (err) {}
}

util.deleteFolder = async (path) => {
  try {
    await fs.rm(path, { recursive: true });
  } catch (err) {}
};

module.exports = util;
