const express = require("express");
const router = express.Router();

router.get("/", (req, res, next) => {
  res.render("index", { title: "Fantasy Starter" });
});

module.exports = router;
