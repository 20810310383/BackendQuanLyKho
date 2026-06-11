const express = require("express");
const router = express.Router();

const uploadAudioMulter = require("../config/uploadAudio");
const { uploadAudio } = require("../controllers/uploads/uploadAudioController");

router.post("/audio", uploadAudioMulter.single("audio"), uploadAudio);

module.exports = router;
