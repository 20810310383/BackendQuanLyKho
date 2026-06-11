const express = require("express");
const router = express.Router();

const uploadVideoMulter = require("../config/uploadVideo");
const { uploadVideo } = require("../controllers/uploads/uploadVideoController");

router.post("/video", uploadVideoMulter.single("video"), uploadVideo);

module.exports = router;
