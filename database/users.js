var db = require('../config/database.js');

exports.getUser = function (user_code) {
	return new Promise(function (resolve, reject) {
		var query = "SELECT * FROM users WHERE user_code = ? limit 1";

		db.get().query(query, [user_code], function (err, rows) {
			if (err)
				reject(err)
			else
				resolve(rows)
		});

		setTimeout(function () {
			reject("WS Call Timeout");
		}, 1000);
	})
};