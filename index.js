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
    const chatId = phone.substring(1) + "@c.us";

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

        client.on('ready', () => {
            console.log('Client is ready!');
            clientMap[id] = {client: client, statusConn : true}

            // Sending message.
            clientMap[id].client.sendMessage(chatId, message);
            res.send("okee deh")
        });

        client.initialize().catch(_ => _)
    }

    if (clientMap[id] && clientMap[id].statusConn == true) {
        // Sending message.
        clientMap[id].client.sendMessage(chatId, message);
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
        if(repeateGenQR > 3){
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

    client.initialize().catch(_ => _)
})

app.listen(port, function () {
    console.log('Express server lisening on port ' + port);
});

async function getVoucherStatistic() {

    const response = await axios.get(
        'http://host.docker.internal:8000/api/voucher/statistic'
    );

    console.log("response data : ", response.data)

    return response.data
}