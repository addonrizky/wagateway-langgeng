const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const KEY_FILE_PATH = path.join("credentials.json");

const SCOPES = ["https://www.googleapis.com/auth/drive"];

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
})

exports.uploadToFolder = async (mimetype, filepath, filename, folderIdGdrive) => {
    try {
        const { data } = await google.drive({ version: "v3", auth: auth }).files
            .create({
                media: {
                    mimeType: mimetype,
                    body: fs.createReadStream(filepath)
                },
                requestBody: {
                    name: filename,
                    parents: [folderIdGdrive]   //folder id in which file should be uploaded
                },
                fields: "id,name"
            })

        console.log(`File uploaded successfully -> ${JSON.stringify(data)}`);
        return "OK"
    } catch (error) {
        console.log("error on upload to gdrive : ", error);
        return "ERROR"
    }
}