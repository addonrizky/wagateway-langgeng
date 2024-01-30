const fs = require("fs");

exports.listDirectories = async function(pth) {
    const directories = (await fs.promises.readdir(pth, {withFileTypes: true}))
        .filter(dirent => dirent.isDirectory())
        .map(dir => dir.name);

    return directories;
}