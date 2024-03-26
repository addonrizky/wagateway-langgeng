const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express')
const cors = require('cors');
const axios = require('axios');
const fs = require("fs");
const sess = require("./session")
const db = require('./config/database');
const users = require('./database/users')
const contacts = require('./database/contacts')
const moment = require('moment')
const FormData = require('form-data');
const {Blob} = require('buffer');
const {File} = require('@web-std/file');
const gdrive = require("./library/gdrive");
const { Contact, GroupChat } = require('whatsapp-web.js/src/structures');
const { chat } = require('googleapis/build/src/apis/chat');

const app = express()
const port = 3093

var corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

var clientMap = {}

app.use(cors(corsOptions));
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/status', (req, res) => {
    const id = req.query.id

    if(!clientMap[id]){
        res.send("CLIENT NOT EXIST")
        return
    }

    const statusConn = clientMap[id].statusConn
    if (statusConn == true){
        res.send("CONNECTED")
    } else {
        res.send("NOTOK")
    }
})

app.post('/message/send', async (req, res) => {
    const id = req.body.user_id
    const phone = req.body.phone;
    const message = req.body.message;
    const attachmentUrl = req.body.attachment_url
    const chatId = phone + "@c.us";

    if (!clientMap[id]) {
        res.send("NO CLIENT EXIST")
        return
    }

    
    if (clientMap[id] && clientMap[id].statusConn == true) {
        let isSent = ""
        if(attachmentUrl != null || attachmentUrl !== undefined){
            const media = await MessageMedia.fromUrl(attachmentUrl);
            isSent = await clientMap[id].client.sendMessage(chatId, media, { caption: message });
        } else {
            isSent = await clientMap[id].client.sendMessage(chatId, message, { linkPreview: true });
        }

        console.log(moment().format() + ": result sent message from id " + id)
        
        res.send("OK")
    } else {
        res.send("CLIENT EXIST BUT DISCONNECTED")
    }
})

app.get('/qr', async (req, res) => {
    console.log(moment().format() + ": qr triggered")
    const id = req.query.id;
    let connstate = null
    let counterResp = 0
    let diffGeneratedTime = 0

    const userInfo = await users.getUser(id)

    if (clientMap[id] && clientMap[id].statusConn == false) {
        connstate = await clientMap[id].client.getState()
        console.log("status connection : ", connstate)

        if(connstate == null){
            diffGeneratedTime = (Math.abs(new Date()) - clientMap[id].createdOn) / 1000
            console.log("diff generated time : ", diffGeneratedTime)
            if(diffGeneratedTime < 90) {
                res.send("kecepetan request ulang nya")
                return
            }
        }

        clientMap[id].client.destroy()
        delete clientMap[id]
        fs.rmSync('./.wwebjs_auth/session-' + id, {recursive: true, force: true,})
    }

    if (clientMap[id] && clientMap[id].statusConn == true) {
        connstate = await clientMap[id].client.getState()
        console.log("status connection : ", connstate)
        res.send(connstate)
        return
    }

    let client = null
    if(clientMap[id]){
        client = clientMap[id].client
    }

    if(!clientMap[id]){
        client = new Client({
            puppeteer: {
                args: [
                    '--no-sandbox',
                    "--disable-setuid-sandbox",
                ],
                headless: true,
            },
            authStrategy: new LocalAuth({ clientId: id }),
            webVersionCache: {
                type: 'remote',
                remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2411.2.html`,
            },
        });
        client.initialize().catch(e => {
            console.log("EH KE CATCH DEH", e)
        })
    }   

    clientMap[id] = {client: client, statusConn : false, createdOn: 0}

    client.once('qr', (qr) => {
        console.log(moment().format() + ": qr generated -> " + qr)
        clientMap[id].createdOn = Math.abs(new Date())
        res.send(qr)
        counterResp++
        return
    });

    client.on('ready', async() => {
        console.log('Client is ready!');
        clientMap[id] = {client: client, statusConn : true, userInfo : userInfo[0]}

        if(counterResp == 0) {
            const connstate = await client.getState()
            res.send(connstate)
        }
    });

    handlingEventClient(client, userInfo)
})


// Creating MySQL connection
db.connect("mode_production", async function (err, rslt) {
    if (err) {
        console.log('Unable to connect to MySQL.');
        process.exit(1);
    } else {
        sess.listDirectories('./.wwebjs_auth')
        .then(async function(listDir){
            listDir.filter(dir => dir != "session")
            .map(async dir => {
                const userCode = dir.split("-")[1]
                const userInfo = await users.getUser(userCode)
                const clientStarted = await startClient(false, userInfo[0])
                //clientMap[userCode] = {client: clientStarted, statusConn : false, createdOn: Math.abs(new Date()), userInfo: userInfo[0]}
            })
        })
        .then(function(){
            app.listen(port, async function () {
                console.log("langgengzzz api url : ", process.env.LANGGENG_API_URL)
                console.log('Express server lisening on port ' + port);
            });
        })
    }
})

async function callWebHookLanggeng(data, clientId) {
    const config = {
        headers:{
            'Content-Type': 'application/json',
        }
    };

    try {
        const response = await axios.post(clientMap[clientId].userInfo.webhook_url, data, config)
    } catch(e){
        console.log("error callwebhook", e)
        return "notok"
    }

    return "OK"
}

async function callInsertMessageHistory(userId, target, type, message) {
    const config = {
        headers:{
            'Content-Type': 'application/json',
        }
    };

    const data = {
        user_id : userId,
        target : target,
        type : type,
        message : message,
    }

    try {
        const response = await axios.post(process.env.LANGGENG_API_URL + "/api/message_history/create", data, config)
    } catch(e){
        console.log("error call insert message history", e)
        return "notok"
    }

    return "OK"
}

async function startClient(withQR, userInfo){
    console.log("try to resurrect clientId : ", userInfo.user_code)
    const clientPre = new Client({
        puppeteer: {
            args: [
                '--no-sandbox',
                "--disable-setuid-sandbox",
            ],
            headless: true,
        },
        authStrategy: new LocalAuth({ clientId: userInfo.user_code}),
        webVersionCache: {
            type: 'remote',
            remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2411.2.html`,
        },
    })
    
    clientPre.initialize().catch(e => {
        console.log("ADUHHH KENA CATCH NIHH YG PREEE", e)
    })
    
    clientPre.on('ready', async () => {
        console.log('Client with id ' +userInfo.user_code+ ' is ready!');
        clientMap[userInfo.user_code] = {client: clientPre, statusConn : true, createdOn : Math.abs(new Date()), userInfo : userInfo}

       // await getContactsInGroup(clientPre)
    });

    handlingEventClient(clientPre, userInfo)

    return clientPre
}

function getFileFromBase64(string64, fileName, mimetype) {
    const imageContent = atob(string64);
    const buffer = new ArrayBuffer(imageContent.length);
    const view = new Uint8Array(buffer);
  
    for (let n = 0; n < imageContent.length; n++) {
      view[n] = imageContent.charCodeAt(n);
    }
    const type = mimetype;
    const blob = new Blob([buffer], { type });
    return new File([blob], fileName, { lastModified: new Date().getTime(), type });
}

async function countContact(addition){
    return addition
}

async function getContactsInGroup(clientPre){
    const whitelistedGroupName = ["PUSAT TIKET AM WISATA","Umroh haji wisata","Umroh Itikaf + turki 2024","FKS PPIU Kota Depok","PASAR PPIU KOTA DEPOK","Umroh Itikaf SBY 30Mar-10Apr","Haji MW Alburaq","MENDADAK UMROH TIKET PROMO","Boking / حجوزات","HARGA HOTEL","Haji Furoda 1444H","MTO-Umroh Ramadhan 2024","Umrah Adventure Februari","MTO 2 - Umroh Ramdhan 2024","Majelis Dzikir Al Mustofa","MY UMRAH MY ADVENTURE","IMEC CHAPTER DEPOK 🚐🚙🚗","Umroh Itikaf 1441H","مجموعة ضيوف البراق","ITIKAF MW 21 MAY 2019","AI Assistance - Hajj & Umrah","Umroh Itikaf 10 April by Lion","Umroh ItikafRamadhan 2019","GROUP ITIKAF GARUDA 11 APR 23","GROUP UMRAH MW 16 MEI 22","PAKET ITIKAF 31MEI-15JUN","AGEN MENARA WISATA","GROUP AWAL RAMADHAN 24 MAR - 6 APR 23","Umroh jalur orang dalem 🤣","Menara wisata Makassar ","Halal Travel","LA bersama MW","Itikaf Backpacker 2023","Itikaf MW 2018 susulan","Trip halal","Safar-e arminareka","TIM KOORDINASI LA MW","Umroh+Turky MW 16 feb'18","Paket itikaf 1-15 jun'18","GROUP Haji MW 2018","Komunitas Umroh Adventure","MihrabQolbi MenaraWisata","Umroh Backpackers 2016","Haji 2018","umroh publisher","Itqon Erwin","itqon shu","ITQON kanomas ust amin","itqon press trip","ITQON aerohajj","safar-e Abhinaya","itqon kanomas11","itqon kanomas 12","ITQON kanomas 13","Itqon Sahid BNIS","itqon mw","ITQON AEROHAJJ 412","Safar-e umroh BNI Syariah","Bedah umroh Adventure ","Al muawanah safar-e","Adventure feb safar-e","Ahsan tour safar-e","Thayyiba Tora safar-e","Umroh Backpacker","Komunitas Umroh Adv1","Komunitas Umroh Adv3","Umroh full team","New full team umroh","Indo India trade 🇮🇩🇮🇳","Aplikasi PU/PH (safar-e)"]

    const allChats = await clientPre.getChats()
    const chatGroups = allChats.filter((chat) => chat.isGroup);
    console.log("sebanyak apa grup nya sblum whitelist: ", chatGroups.length)

    const whitelistedGroups = chatGroups.filter((chat) => {
        return whitelistedGroupName.includes(chat.name)
    })

    console.log("sebanyak apa grup nya stelah whitelist: ", whitelistedGroups.length)

    let totalContact = 0
    let countGroup = 1
    var arr = [];
    let indonesian = null
    for (const group of whitelistedGroups) {
        console.log("WHAT GROUP :", group.name)
        const participants = group.participants
        for(const participant of participants){
            const participantId = participant.id._serialized
            if(participantId.substring(0,2) == "62"){
                console.log("participant id nya : ", participantId)
                const contact = await clientPre.getContactById(participantId);
                console.log("contact : ", contact)
                console.log("")
                contacts.addContact(contact.pushname, contact.number)
                totalContact++
            }
        }
    }
    console.log("jadi dapet berapa : ",totalContact) 
}

async function uploadToGdrive(msg, userInfo){
    const media = await msg.downloadMedia();

    if(media.filename === undefined){
        console.log("filename undefined not expected to be upload to gdrive")
        return 
    }

    if(!media.filename.includes(userInfo.file_pattern)){
        console.log("file name not expected to be upload to gdrive")
        return
    }

    fs.writeFileSync(
        "./upload/" + media.filename,
        media.data,
        "base64"
    );

    const isit = fs.createReadStream("./upload/" + media.filename)

    // var formData = new FormData();
    // formData.append("name", 2);
    // formData.append("phone_number", 4);
    // formData.append("import_file",isit);
    // formData.append("produk", 6);
    // formData.append("resi", 8);
// 
    // const subscribeAudienceToCampaign = await axios.post('http://host.docker.internal:8000/api/campaigns/22/audiences/import', formData, {
    //     headers: {
    //         'Content-Type': 'multipart/form-data',
    //         'Authorization' : 'Bearer 53|cSZZ04SZQNLe5rsQWOFIaXzcxJluww9MV8yB2kQ5',
    //     }
    // })
// 
    // console.log(subscribeAudienceToCampaign)

    // upload to gdrive
    const uploadRslt = await gdrive.uploadToFolder(media.mimetype, "./upload/" + media.filename, media.filename, userInfo.gdrive_folder)
    console.log(uploadRslt)
}

function handlingEventClient(client, userInfo){
    const id = userInfo.user_code
    client.on('message', async msg => {
        const from = msg.from.split("@")[0]
    
        if (msg.body == '!ping') {
            msg.reply('pong');
        }

        if(msg.hasMedia && userInfo.is_auto_gdrive){
            uploadToGdrive(msg, userInfo)
        }

        if(msg.type == "document"){
            console.log("message detected as document, ignore to continue")
            return
        }
    
        if(msg.body == ''){
            console.log("bodynya kosongg")
            return
        }

        if(msg.body.substring(0, 3) == '/9j'){
            console.log("incoming message not text, ignored")
            return
        }
    
        if(msg.body != '' && from.length > 15){
            console.log("incoming message from group, ignored")
            return
        }
    
        try {
            if(!userInfo.is_saved){
                console.log("flag is_saved is off, ignore to call webhook")
                return
            } 

            callWebHookLanggeng(msg, id)
        } catch(e){
            console.log("error call webhook")
        }
        
    });
    
    client.on('message_create', async msg => {
        const to = msg.to.split("@")[0]
        const isOutbound = msg.id.fromMe
        if(msg.body == "" || !isOutbound){
            return
        }

        if(!userInfo.is_saved){
            console.log("flag is_saved is off, ignore to save message")
            return
        }

        callInsertMessageHistory(id, to, "outbound", msg.body)
    })

    client.on('disconnected', rsn => {
        console.log("disconnected nih")
        client.destroy()
        delete clientMap[id]
        fs.rmSync('./.wwebjs_auth/session-' + id, {recursive: true, force: true,})
        return
    });

    client.on('authenticated', mmm => {
        console.log("sini?")
    })

    client.on('change_state', state => {
        console.log("perubahan state nya : ", state)
    })
}