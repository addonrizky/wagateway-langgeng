var mysql = require('mysql');

var state = {
  pool: null,
  mode: null,
}

exports.connect = function(mode, done) {
  state.pool = mysql.createPool({
    //connectionLimit: 50,
    connectionLimit: 150,
    host: process.env.HOST_DB_WALANGGENG,
    user:  process.env.USER_DB_WALANGGENG,
    password:  process.env.PASS_DB_WALANGGENG,
    database: process.env.SCHEMA_DB_WALANGGENG,
    multipleStatements : true,
    port: process.env.PORT_DB_WALANGGENG
  })

  state.mode = mode;
  done();
}

exports.get = function() {
  return state.pool;
}
