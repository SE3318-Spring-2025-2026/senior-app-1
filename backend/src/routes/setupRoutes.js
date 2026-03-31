const express = require("express");
const router = express.Router();

let currentToken = null;

router.post("/setup-token", (req, res) => {
  currentToken = Math.random().toString(36).substring(2, 15);

  res.status(201).json({
    message: "Setup token created",
    token: currentToken
  });
});

module.exports = router;