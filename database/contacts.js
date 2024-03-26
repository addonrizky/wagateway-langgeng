var db = require('../config/database.js');

exports.addContact = function (name, phone) {
    var trx_data = {
      'name': name,
      'phone': phone,
    };
    db.get().query('INSERT INTO contact_wakhaji SET ?', [trx_data], function (err, result) {
        if(err != null || err !== undefined){
            console.log("error on insert contact : ", err)
        }
    })
}