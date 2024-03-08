const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express')
const cors = require('cors');
const axios = require('axios');
const fs = require("fs");
const sess = require("./session")
const db = require('./config/database');
const users = require('./database/users')
const moment = require('moment')

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

     // Number where you want to send the message.
    const phone = req.body.phone;

    // Your message.
    const message = req.body.message;

    // attachment 
    const attachmentUrl = req.body.attachment_url

    // Getting chatId from the number.
    // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
    const chatId = phone + "@c.us";

    let isSent = ""
    // check client map
    // if client not exist check in local storage webauth
    // if exist then set the map with founded 
    if (!clientMap[id]) {
        res.send("NO CLIENT EXIST")
        return
    }

    if (clientMap[id] && clientMap[id].statusConn == true) {
        // Sending message.
        if(attachmentUrl != null || attachmentUrl !== undefined){
            const media = await MessageMedia.fromUrl(attachmentUrl);
            isSent = await clientMap[id].client.sendMessage(chatId, media, { caption: message });
        } else {
            isSent = await clientMap[id].client.sendMessage(chatId, message, { linkPreview: true });
        }
        
        res.send("OK")
    } else {
        res.send("CLIENT EXIST BUT DISCONNECTED")
    }
})

app.get('/qr', async (req, res) => {
    console.log(moment().format() + ": qr triggered")
    const id = req.query.id;
    let connstate = null
    let repeateGenQR = 0
    let counterResp = 0
    let diffGeneratedTime = 0

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

    const client = new Client({
        puppeteer: {
            args: [
                '--no-sandbox',
                "--disable-setuid-sandbox",
            ],
            headless: true,
        },
        authStrategy: new LocalAuth({ clientId: id })
    });

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
        const userInfo = await users.getUser(id)
        clientMap[id] = {client: client, statusConn : true, userInfo : userInfo[0]}

        if(counterResp == 0) {
            const connstate = await client.getState()
            res.send(connstate)
        }
    });

    client.on('message', async msg => {
        const from = msg.from.split("@")[0]

        if (msg.body == '!ping') {
            msg.reply('pong');
        }

        if (msg.body == 'voucher statistic') {
            vstat = await getVoucherStatistic()
            msg.reply(JSON.stringify(vstat))
        }

        if(msg.body == ''){
            console.log("bodynya kosongg")
            return
        }

        if(msg.body != '' && from.length > 15){
            console.log("incoming message from group, ignored")
            return
        }

        try {
            callWebHookLanggeng(msg, id)
        } catch(e){
            console.log("error call webhook")
        }
        
    });

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

    client.initialize().catch(e => {
        console.log("EH KE CATCH DEH", e)
    })
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

async function getVoucherStatistic() {

    const response = await axios.get(
        'http://host.docker.internal:8000/api/voucher/statistic'
    );

    console.log("response data : ", response.data)

    return response.data
}

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
        authStrategy: new LocalAuth({ clientId: userInfo.user_code})
    })
    
    clientPre.initialize().catch(_ => {
        console.log("ADUHHH KENA CATCH NIHH YG PREEE")
    })

    clientPre.on("change_state", async (currState) => {
        console.log(currState)
    })
    
    clientPre.on('ready', async () => {
        console.log('Client with id ' +userInfo.user_code+ ' is ready!');
        clientMap[userInfo.user_code] = {client: clientPre, statusConn : true, createdOn : Math.abs(new Date()), userInfo : userInfo}
    });
    
    clientPre.on('message', async msg => {
        if (msg.body == '!ping') {
            msg.reply('pong');
        }
    
        if (msg.body == 'voucher statistic') {
            vstat = await getVoucherStatistic()
            msg.reply(JSON.stringify(vstat))
        }
    
        if(msg.body == ''){
            console.log("bodynya kosongg")
            //console.log(msg)
            return
        }
    
        if(msg.body != ''){
            console.log("ada nih bodynya aman")
            const from = msg.from.split("@")[0]
            const msgBody = msg.body

            if(from == "6281585002225" && msgBody.length > 20){
                console.log("do gpt")
                const response = await axios.get(
                    'http://host.docker.internal:4004/getAnswer?question=' + msgBody
                );

                clientPre.sendMessage(from+"@c.us", response.data)
            }

            if (from.length > 15) {
                console.log("incoming message from group, ignored")
                return
            }
        }
    
        try{
            callWebHookLanggeng(msg, userInfo.user_code)
        } catch(e) {
            console.log("error incoming message")
        }
    });

    return clientPre
}