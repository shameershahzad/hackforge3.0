const mongoose = require("mongoose");

const userAccountSchema = new mongoose.Schema({
   name:String,
   email:String,
   password:String
})

const userAccountModel = mongoose.model("UserAccount",userAccountSchema);
module.exports = userAccountModel