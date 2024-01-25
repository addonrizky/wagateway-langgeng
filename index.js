const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express')
const cors = require('cors');
const axios = require('axios');
const fs = require("fs");

const app = express()
const port = 3093

var corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

var clientMap = {}

/* ------------------------------------------------------------------------- */
const clientPre = new Client({
    puppeteer: {
        args: [
            '--no-sandbox',
        ],
        headless: true,
    },
    authStrategy: new LocalAuth({ clientId: process.env.HARDCODED_USER_ID })
})

clientPre.initialize().catch(_ => {
    console.log("ADUHHH KENA CATCH NIHH YG PREEE")
})

clientPre.on('ready', async () => {
    console.log('Client is ready!');
    clientMap[process.env.HARDCODED_USER_ID] = {client: clientPre, statusConn : true}
});

/* ------------------------------------------------------------------------- */

app.use(cors(corsOptions));
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.post('/message/send', async (req, res) => {
    const id = req.body.user_id

     // Number where you want to send the message.
    const phone = req.body.phone;

    // Your message.
    const message = req.body.message;

    // Getting chatId from the number.
    // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
    const chatId = phone + "@c.us";

    let isSent = ""
    // check client map
    // if client not exist check in local storage webauth
    // if exist then set the map with founded 
    if (!clientMap[id]) {
        const client = new Client({
            puppeteer: {
                args: [
                    '--no-sandbox',
                ],
                headless: true,
            },
            authStrategy: new LocalAuth({ clientId: id })
        })

        client.on('ready', async () => {
            console.log('Client is ready!');
            clientMap[id] = {client: client, statusConn : true}

            // Sending message.
            isSent = await clientMap[id].client.sendMessage(chatId, message);
            console.log("terkirim ges msg nya A1 : ", isSent._data)
            res.send("okee deh")
        });

        client.on('message', async msg => {
            if (msg.body == '!ping') {
                msg.reply('pong');
            }
    
            if (msg.body == 'voucher statistic') {
                vstat = await getVoucherStatistic()
                msg.reply(JSON.stringify(vstat))
            }

            if(msg.body == ''){
                console.log("bodynya kosongg")
                console.log(msg)
                return
            }
    
            if(msg.body != ''){
                console.log("ada nih bodynya aman")
            }
    
            try{
                callWebHookLanggeng(msg)
            } catch(e) {
                console.log("error incoming message")
            }
            
        });

        client.initialize().catch(_ => {
            console.log("ADUHHH KENA CATCH NIHH")
        })
    }

    if (clientMap[id] && clientMap[id].statusConn == true) {
        // Sending message.
        isSent = await clientMap[id].client.sendMessage(chatId, message);
        console.log("terkirim ges msg nya A1 : ", isSent._data)
        res.send("okee deh")
    }
})

app.get('/qr', async (req, res) => {
    const id = req.query.id;
    let connstate = null
    let repeateGenQR = 0
    let counterResp = 0

    if (clientMap[id] && clientMap[id].statusConn == false) {
        connstate = await clientMap[id].client.getState()
        console.log("status connection : ", connstate)
        clientMap[id].client.destroy()
        delete clientMap[id]
    }

    if (clientMap[id] && clientMap[id].statusConn == true) {
        console.log("KE SINI GA  SIH  KALO CONNECTED")
        connstate = await clientMap[id].client.getState()
        console.log("status connection : ", connstate)
        res.send(connstate)
        return
    }

    console.log("yukk gass bikin qr, ID nya : ", id)

    const client = new Client({
        puppeteer: {
            args: [
                '--no-sandbox',
            ],
            headless: true,
            qrMaxRetries: 3
        },
        authStrategy: new LocalAuth({ clientId: id })
    });

    clientMap[id] = {client: client, statusConn : false}

    client.on('qr', (qr) => {
        repeateGenQR += 1
        // Generate and scan this code with your phone
        console.log("qr successfully generated", qr)
        console.log("repeated times : ", repeateGenQR)
        if(repeateGenQR > 1){
            try{
                client.pupBrowser.close()
            } catch(e){
                console.log("ERROR CLOSING AFTER RETRYINGG GEN QR : ", e)
            }
            
            delete clientMap[id]
            fs.rmSync('./.wwebjs_auth/session-' + id, {recursive: true, force: true,})
        }
        res.send(qr)
        counterResp++
        return
    });

    client.on('ready', async() => {
        console.log('Client is ready!');
        clientMap[id] = {client: client, statusConn : true}

        if(counterResp == 0) {
            const connstate = await client.getState()
            res.send(connstate)
        }
    });

    client.on('message', async msg => {
        if (msg.body == '!ping') {
            msg.reply('pong');
        }

        if (msg.body == 'voucher statistic') {
            vstat = await getVoucherStatistic()
            msg.reply(JSON.stringify(vstat))
        }

        if(msg.body == ''){
            console.log("bodynya kosongg")
            console.log(msg)
            return
        }

        if(msg.body != ''){
            console.log("ada nih bodynya aman")
        }

        try {
            callWebHookLanggeng(msg)
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

    client.initialize().catch(_ => {
        console.log("EH KE CATCH DEH")
    })
})

app.listen(port, function () {
    console.log("langgeng api url : ", process.env.LANGGENG_API_URL)
    console.log("hardcode usercommprovider code : ", process.env.HARDCODED_CODE_USERCOMM)
    console.log('Express server lisening on port ' + port);
});

async function getVoucherStatistic() {

    const response = await axios.get(
        'http://host.docker.internal:8000/api/voucher/statistic'
    );

    console.log("response data : ", response.data)

    return response.data
}

async function callWebHookLanggeng(data) {
    const config = {
        headers:{
            'Content-Type': 'application/json',
        }
    };

    try {
        const response = await axios.post(process.env.LANGGENG_API_URL +'/api/communication-providers/'+process.env.HARDCODED_CODE_USERCOMM+'/webhooks', data, config)
    } catch(e){
        console.log("error callwebhook")
        return "notok"
    }
    

    //console.log("response data : ", response.data)

    return "OK"
}