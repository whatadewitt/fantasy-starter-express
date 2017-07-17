const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  guid: { type: String, required: true, unique: true },
  nickname: { type: String, required: true, unique: true },
  url: String,
  avatar: String,
  created_at: Date,
  access_token: String,
  refresh_token: String
});
const User = mongoose.model("User", UserSchema);

module.exports = User;
