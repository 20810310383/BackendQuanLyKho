const express = require("express");
const router = express.Router();

const uploadImageMulter = require("../config/uploadImage");
const { uploadImage } = require("../controllers/uploads/uploadImageController");

router.post("/image", uploadImageMulter.single("image"), uploadImage);

module.exports = router;
